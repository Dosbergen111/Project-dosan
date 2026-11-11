"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type Account = {
  id: number;
  username: string;
  elo: number;
  energy: number;
  role: string;
  is_premium: boolean;
  league: string;
  sessionToken: string;
};

type CachedAccount = Omit<Account, "sessionToken">;
type ProfileData = CachedAccount;
type AuthContextValue = {
  account: Account | null;
  isSessionLoading: boolean;
  setAccount: Dispatch<SetStateAction<Account | null>>;
  clearAccount: () => void;
  refreshProfile: () => Promise<void>;
};

const ACCOUNT_STORAGE_KEY = "chessAccount";
const AuthContext = createContext<AuthContextValue | null>(null);

let snapshotInitialized = false;
let accountSnapshot: Account | null = null;
let sessionLoadingSnapshot = true;

function readStoredAccount(): Account | null {
  if (typeof window === "undefined") return null;

  const sessionToken = window.sessionStorage.getItem("sessionToken");
  if (!sessionToken) return null;
  const rawAccount = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
  if (!rawAccount) return null;

  try {
    const cached = JSON.parse(rawAccount) as Partial<CachedAccount>;
    if (
      typeof cached.id !== "number" ||
      !Number.isSafeInteger(cached.id) ||
      typeof cached.username !== "string" ||
      typeof cached.elo !== "number" ||
      typeof cached.energy !== "number" ||
      typeof cached.role !== "string" ||
      typeof cached.league !== "string" ||
      typeof cached.is_premium !== "boolean"
    ) {
      return null;
    }
    return {
      id: cached.id,
      username: cached.username,
      elo: cached.elo,
      energy: cached.energy,
      role: cached.role,
      is_premium: cached.is_premium,
      league: cached.league,
      sessionToken,
    };
  } catch (error) {
    console.error("Could not read the cached profile:", error);
    return null;
  }
}

function getAccountSnapshot(): Account | null {
  if (!snapshotInitialized) {
    accountSnapshot = readStoredAccount();
    snapshotInitialized = true;
  }
  return accountSnapshot;
}

function subscribeToAccount(onChange: () => void): () => void {
  const onStorage = () => {
    accountSnapshot = readStoredAccount();
    snapshotInitialized = true;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("chess-account-change", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("chess-account-change", onStorage);
  };
}

function getSessionLoadingSnapshot(): boolean {
  return sessionLoadingSnapshot;
}

function subscribeToSessionLoading(onChange: () => void): () => void {
  window.addEventListener("chess-session-ready", onChange);
  return () => window.removeEventListener("chess-session-ready", onChange);
}

function finishSessionLoading(): void {
  sessionLoadingSnapshot = false;
  window.dispatchEvent(new Event("chess-session-ready"));
}

function publishAccount(account: Account | null): void {
  accountSnapshot = account;
  snapshotInitialized = true;
  if (account) {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({
      id: account.id,
      username: account.username,
      elo: account.elo,
      energy: account.energy,
      role: account.role,
      is_premium: account.is_premium,
      league: account.league,
    }));
    window.localStorage.setItem("userId", String(account.id));
  } else {
    window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
  }
  window.dispatchEvent(new Event("chess-account-change"));
}

function clearStoredSession(): void {
  window.sessionStorage.removeItem("sessionToken");
  window.localStorage.removeItem("userId");
  publishAccount(null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isSessionLoading = useSyncExternalStore(
    subscribeToSessionLoading,
    getSessionLoadingSnapshot,
    () => true,
  );
  const account = useSyncExternalStore(
    subscribeToAccount,
    getAccountSnapshot,
    () => null,
  );

  useEffect(() => {
    document.body.classList.toggle("premium-theme", account?.is_premium === true);
  }, [account?.is_premium]);

  const setAccount = useCallback<Dispatch<SetStateAction<Account | null>>>((next) => {
    const current = getAccountSnapshot();
    publishAccount(typeof next === "function" ? next(current) : next);
  }, []);

  const clearAccount = useCallback(() => {
    clearStoredSession();
  }, []);

  const refreshProfile = useCallback(async () => {
    const currentAccount = getAccountSnapshot();
    const sessionToken = window.sessionStorage.getItem("sessionToken");
    const userId = Number(window.localStorage.getItem("userId"));
    if (!currentAccount || !sessionToken || !Number.isSafeInteger(userId) || userId < 1) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`/api/profile?userId=${userId}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        clearStoredSession();
        return;
      }
      const data = (await response.json()) as ProfileData & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Ошибка профиля (${response.status}).`);
      setAccount({ ...data, sessionToken });
    } finally {
      window.clearTimeout(timeout);
    }
  }, [setAccount]);

  useEffect(() => {
    const sessionToken = window.sessionStorage.getItem("sessionToken");
    const userId = Number(window.localStorage.getItem("userId"));
    if (!sessionToken || !Number.isSafeInteger(userId) || userId < 1) {
      finishSessionLoading();
      return;
    }

    let active = true;
    let retryTimer: number | undefined;
    let requestTimeout: number | undefined;
    let controller: AbortController | undefined;
    let retryDelay = 5_000;

    const loadProfile = async () => {
      if (!active) return;
      controller = new AbortController();
      requestTimeout = window.setTimeout(() => controller?.abort(), 10_000);
      try {
        const response = await fetch(`/api/profile?userId=${userId}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          clearStoredSession();
          return;
        }
        const data = (await response.json()) as ProfileData & { error?: string };
        if (!response.ok) throw new Error(data.error ?? `Ошибка профиля (${response.status}).`);
        if (!active) return;
        setAccount({ ...data, sessionToken });
      } catch (error) {
        if (!active) return;
        console.error("Could not refresh the profile; retrying:", error);
        retryTimer = window.setTimeout(() => void loadProfile(), retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      } finally {
        if (active) finishSessionLoading();
        if (requestTimeout !== undefined) window.clearTimeout(requestTimeout);
      }
    };

    const initialRequest = window.setTimeout(() => void loadProfile(), 0);
    return () => {
      active = false;
      window.clearTimeout(initialRequest);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (requestTimeout !== undefined) window.clearTimeout(requestTimeout);
      controller?.abort();
    };
  }, [setAccount]);

  const value = useMemo(
    () => ({ account, isSessionLoading, setAccount, clearAccount, refreshProfile }),
    [account, isSessionLoading, setAccount, clearAccount, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}

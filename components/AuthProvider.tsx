"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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
};

type ProfileData = Account & { error?: string };
type AuthContextValue = {
  account: Account | null;
  isSessionLoading: boolean;
  setAccount: Dispatch<SetStateAction<Account | null>>;
  clearAccount: () => void;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  useEffect(() => {
    document.body.classList.toggle("premium-theme", account?.is_premium === true);
  }, [account?.is_premium]);

  const refreshProfile = useCallback(async () => {
    const response = await fetch("/api/profile", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = (await response.json()) as ProfileData;
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) setAccount(null);
      throw new Error(data.error ?? `Ошибка профиля (${response.status}).`);
    }
    setAccount(data);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/profile", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as ProfileData;
        if (response.status === 401 || response.status === 403) {
          setAccount(null);
          return;
        }
        if (!response.ok) throw new Error(data.error ?? `Ошибка профиля (${response.status}).`);
        setAccount(data);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error("Could not load the profile:", error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsSessionLoading(false);
      });

    return () => controller.abort();
  }, []);

  const clearAccount = useCallback(() => setAccount(null), []);
  const value = useMemo(
    () => ({ account, isSessionLoading, setAccount, clearAccount, refreshProfile }),
    [account, isSessionLoading, clearAccount, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}

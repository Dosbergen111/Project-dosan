"use client";

import type { Account } from "@/components/AuthProvider";

type ProfileData = Account & { error?: string };

export async function fetchCurrentSession(signal?: AbortSignal): Promise<Account | null> {
  const response = await fetch("/api/profile", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const data = (await response.json()) as ProfileData;
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error(data.error ?? `Ошибка профиля (${response.status}).`);
  return data;
}

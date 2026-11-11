"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth, type Account } from "@/components/AuthProvider";

type ProfileResponse = Account & { error?: string };

export default function PremiumActivation() {
  const { account, isSessionLoading, setAccount } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function activate() {
    if (!account || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/premium/activate", {
        method: "POST",
      });
      const data = (await response.json()) as ProfileResponse;
      if (!response.ok) throw new Error(data.error ?? "Не удалось активировать Premium.");
      setAccount(data);
      setMessage("Premium активирован. Списаний нет.");
    } catch (error) {
      console.error("Premium demo activation failed:", error);
      setMessage(error instanceof Error ? error.message : "Не удалось активировать Premium.");
    } finally {
      setBusy(false);
    }
  }

  if (isSessionLoading) {
    return <div className="session-skeleton" aria-label="Загрузка профиля" aria-busy="true"><span /><span /></div>;
  }

  if (!account) {
    return (
      <div>
        <p className="payment-status" role="status">
          {message || "Войдите в аккаунт, чтобы активировать Premium."}
        </p>
        <Link className="button button-primary" href="/">Войти на странице игры</Link>
      </div>
    );
  }

  return (
    <div className="premium-activation">
      <button className="button button-primary" type="button" onClick={() => void activate()} disabled={busy || account.is_premium}>
        {account.is_premium ? "Premium уже активен" : busy ? "Активируем…" : "Активировать Premium (демо)"}
      </button>
      {message && <p className="payment-status" role="status">{message}</p>}
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function ChangePasswordForm() {
  const { account } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: account.id, oldPassword, newPassword }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось сменить пароль.");
      setOldPassword("");
      setNewPassword("");
      setMessage("Пароль изменён.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сменить пароль.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Старый пароль"
        value={oldPassword}
        onChange={(event) => setOldPassword(event.target.value)}
        required
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Новый пароль"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        required
      />
      <button type="submit" disabled={!account || busy}>
        {busy ? "Смена пароля…" : "Сменить пароль"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

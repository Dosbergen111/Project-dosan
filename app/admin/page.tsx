"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import ProfileSummary from "@/components/ProfileSummary";

type AdminUser = {
  id: number;
  username: string;
  elo: number;
  energy: number;
  role: string;
  is_blocked: boolean;
  is_premium: boolean;
};

type UserResponse = { users?: AdminUser[]; error?: string };

export default function AdminPage() {
  const { account, isSessionLoading, refreshProfile } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [eloValues, setEloValues] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const data = (await response.json()) as UserResponse;
    if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить пользователей.");
    const nextUsers = data.users ?? [];
    setUsers(nextUsers);
    setEloValues(Object.fromEntries(nextUsers.map((user) => [user.id, String(user.elo)])));
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (isSessionLoading) return;
      if (!account) {
        if (active) {
          setError("Войдите на странице игры с учётной записью администратора.");
          setBusy(false);
        }
        return;
      }
      try {
        if (active) await loadUsers();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Не удалось открыть админку.");
      } finally {
        if (active) setBusy(false);
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [account, isSessionLoading, loadUsers]);

  async function action(
    endpoint: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Действие не выполнено.");
      await loadUsers();
      if (endpoint === "toggle-premium" && account?.id === Number(payload.id)) {
        try {
          await refreshProfile();
        } catch (cause) {
          console.error("Could not refresh the admin profile after Premium update:", cause);
          setError("Premium обновлён, но профиль не синхронизирован. Повторите позже.");
        }
      }
      setMessage(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Действие не выполнено.");
    }
  }

  return (
    <>
      <header className="site-header">
        <h1>♔ Chess Master ♚</h1>
        <nav className="site-nav" aria-label="Основные страницы">
          <Link href="/">Игра</Link>
          <Link href="/admin" aria-current="page">Админка</Link>
        </nav>
        <div className="header-right"><ProfileSummary /></div>
      </header>
      <main className="admin-container page-content">
        <section className="panel">
          <h2>⚙️ Управление игроками</h2>
          {error && <p className="admin-error" role="alert">{error}</p>}
          {message && <p className="admin-success" role="status">{message}</p>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Игрок</th>
                  <th>Elo</th>
                  <th>Энергия</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {busy ? (
                  <tr><td colSpan={7}>Загрузка…</td></tr>
                ) : users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td>{user.username}{user.is_premium ? " 💎" : ""}</td>
                    <td>
                      <input
                        type="number"
                        min={100}
                        max={3000}
                        step={1}
                        value={eloValues[user.id] ?? ""}
                        aria-label={`Elo игрока ${user.username}`}
                        onChange={(event) => setEloValues((values) => ({
                          ...values,
                          [user.id]: event.target.value,
                        }))}
                      />
                    </td>
                    <td>{user.is_premium ? "∞" : user.energy}</td>
                    <td>{user.role}</td>
                    <td>{user.is_blocked ? "🔴 Забанен" : "🟢 Ок"}</td>
                    <td className="admin-actions">
                      <button
                        className="btn-premium"
                        onClick={() => void action(
                          "update-elo",
                          { id: user.id, elo: Number(eloValues[user.id]) },
                          `Elo игрока ${user.username} обновлён.`,
                        )}
                      >Сохранить Elo</button>
                      <button
                        className="btn-premium"
                        onClick={() => void action(
                          "toggle-premium",
                          { id: user.id, premiumStatus: !user.is_premium },
                          `Premium ${user.is_premium ? "снят" : "включён"} для ${user.username}.`,
                        )}
                      >{user.is_premium ? "Снять VIP" : "Дать VIP"}</button>
                      <button
                        className={`btn-block${user.is_blocked ? " btn-unblock" : ""}`}
                        onClick={() => void action(
                          "block",
                          { id: user.id, block: !user.is_blocked },
                          `Статус ${user.username} обновлён.`,
                        )}
                      >{user.is_blocked ? "Разбанить" : "Забанить"}</button>
                    </td>
                  </tr>
                ))}
                {!busy && !error && !users.length && (
                  <tr><td colSpan={7}>Пользователи не найдены.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="page-note">Доступ только для учётных записей с ролью admin.</p>
        </section>
      </main>
    </>
  );
}

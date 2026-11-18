"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth, type Account } from "@/components/AuthProvider";
import { useGame } from "@/components/chess/GameProvider";
import { LiaSignInAltSolid, LiaTimesSolid, LiaUserPlusSolid } from "react-icons/lia";

export default function GameAuthModal() {
  const { account, setAccount } = useAuth();
  const game = useGame();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const openAuth = () => setAuthOpen(true);
    window.addEventListener("open-chess-auth", openAuth);
    return () => window.removeEventListener("open-chess-auth", openAuth);
  }, []);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json() as Account & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Ошибка запроса (${response.status}).`);
      if (authMode === "register") {
        game.resetLocalGame(null);
        setAuthMode("login");
        setPassword("");
        setMessage("Регистрация прошла успешно. Теперь войдите.");
      } else {
        setAccount(data);
        game.resetLocalGame(data.id);
        setPassword("");
        setAuthOpen(false);
        setMessage("");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить запрос.");
    } finally {
      setBusy(false);
    }
  }

  if (!authOpen || account) return null;

  return (
    <div className="auth-modal" onMouseDown={(event) => event.target === event.currentTarget && setAuthOpen(false)}>
      <div className="auth-modal-content">
        <div className="auth-modal-header">
          <h2>{authMode === "register" ? "Регистрация" : "Вход"}</h2>
          <button className="auth-modal-close" type="button" onClick={() => setAuthOpen(false)} aria-label="Закрыть"><LiaTimesSolid aria-hidden="true" /></button>
        </div>
        <form onSubmit={handleAuth}>
          <div className="auth-form-group">
            <label htmlFor="auth-username">Username</label>
            <input id="auth-username" autoComplete="username" required maxLength={50} value={username} onChange={(event) => setUsername(event.target.value)} />
          </div>
          <div className="auth-form-group">
            <label htmlFor="auth-password">Password</label>
            <input id="auth-password" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          {message && <div className="auth-error" role="status">{message}</div>}
          <button type="submit" className="auth-submit-btn" disabled={busy}>{busy ? "Подождите…" : authMode === "register" ? <><LiaUserPlusSolid aria-hidden="true" /> Зарегистрироваться</> : <><LiaSignInAltSolid aria-hidden="true" /> Войти</>}</button>
        </form>
      </div>
    </div>
  );
}

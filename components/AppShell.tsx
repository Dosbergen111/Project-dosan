"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

const links = [
  { href: "/play", label: "🎮 Игра" },
  { href: "/daily", label: "📅 Дневной матч" },
  { href: "/rules", label: "📖 Правила" },
  { href: "/chat", label: "💬 Чат" },
  { href: "/leaders", label: "🏆 Лидеры" },
  { href: "/history", label: "📊 История" },
  { href: "/analyze", label: "🔍 Анализ" },
  { href: "/puzzles", label: "🧩 Задачи" },
  { href: "/online", label: "🌐 Онлайн" },
  { href: "/settings", label: "⚙️ Настройки" },
  { href: "/about", label: "ℹ️ О программе" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { account, isSessionLoading, clearAccount } = useAuth();

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
    clearAccount();
  }

  return (
    <>
      <header className="site-header">
        <h1><Link href="/play">♔ Chess Master ♚</Link></h1>
        <nav className="header-right" aria-label="Основная навигация">
          <Link className="auth-button" href="/pay">Premium</Link>
          {account?.role === "admin" && <Link className="auth-button" href="/admin">Админка</Link>}
          {isSessionLoading ? (
            <span className="session-skeleton" aria-label="Загрузка профиля" aria-busy="true" />
          ) : account ? (
            <>
              <span id="user-profile">{account.username} · {account.elo} Elo</span>
              <button className="logout-button" type="button" onClick={logout}>Выйти</button>
            </>
          ) : (
            <button
              type="button"
              className="auth-button"
              onClick={() => window.dispatchEvent(new Event("open-chess-auth"))}
            >
              Войти / Регистрация
            </button>
          )}
        </nav>
      </header>
      <div className="container route-container">
        <nav id="section-tabs" className="tabs route-sidebar" aria-label="Разделы сайта">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`tab-button${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <main className="route-content">{children}</main>
      </div>
    </>
  );
}

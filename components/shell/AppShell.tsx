"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/chess/GameProvider";
import {
  LiaChessBoardSolid,
  LiaCalendarSolid,
  LiaBookOpenSolid,
  LiaComments,
  LiaTrophySolid,
  LiaHistorySolid,
  LiaSearchSolid,
  LiaPuzzlePieceSolid,
  LiaGlobeSolid,
  LiaCogSolid,
  LiaInfoSolid,
  LiaUserSolid,
  LiaSignOutAltSolid,
  LiaCrownSolid,
  LiaMoon,
  LiaSun,
  LiaBarsSolid,
  LiaTimesSolid,
} from "react-icons/lia";
import type { ComponentType } from "react";
import { useState } from "react";

type MenuIcon = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

const links: { href: string; label: string; icon: MenuIcon }[] = [
  { href: "/play", label: "Игра", icon: LiaChessBoardSolid },
  { href: "/daily", label: "Дневной матч", icon: LiaCalendarSolid },
  { href: "/rules", label: "Правила", icon: LiaBookOpenSolid },
  { href: "/chat", label: "Чат", icon: LiaComments },
  { href: "/leaders", label: "Лидеры", icon: LiaTrophySolid },
  { href: "/history", label: "История", icon: LiaHistorySolid },
  { href: "/analyze", label: "Анализ", icon: LiaSearchSolid },
  { href: "/puzzles", label: "Задачи", icon: LiaPuzzlePieceSolid },
  { href: "/online", label: "Онлайн", icon: LiaGlobeSolid },
  { href: "/settings", label: "Настройки", icon: LiaCogSolid },
  { href: "/about", label: "О программе", icon: LiaInfoSolid },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { account, isSessionLoading, clearAccount } = useAuth();
  const game = useGame();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
    clearAccount();
  }

  return (
    <>
      <header className="site-header">
        <h1><Link href="/play">Chess Master</Link></h1>
        <nav className="header-right" aria-label="Основная навигация">
          <Link className="auth-button" href="/pay"><LiaCrownSolid aria-hidden="true" /> <span>Premium</span></Link>
          {account?.role === "admin" && <Link className="auth-button" href="/admin">Админка</Link>}
          {isSessionLoading ? (
            <span className="session-skeleton" aria-label="Загрузка профиля" aria-busy="true" />
          ) : account ? (
            <>
              <span id="user-profile"><LiaUserSolid aria-hidden="true" /> {account.username} · {account.elo} Elo</span>
              <button className="logout-button" type="button" onClick={logout} aria-label="Выйти"><LiaSignOutAltSolid aria-hidden="true" /><span> Выйти</span></button>
            </>
          ) : (
            <button type="button" className="auth-button" onClick={() => window.dispatchEvent(new Event("open-chess-auth"))}>
              <LiaUserSolid aria-hidden="true" /> Войти / Регистрация
            </button>
          )}
          <button
            type="button"
            className="auth-button theme-toggle"
            aria-label={game.lightTheme ? "Включить тёмную тему" : "Включить светлую тему"}
            onClick={() => game.setLightTheme(!game.lightTheme)}
          >
            {game.lightTheme ? <LiaMoon aria-hidden="true" /> : <LiaSun aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <LiaTimesSolid aria-hidden="true" /> : <LiaBarsSolid aria-hidden="true" />}
          </button>
        </nav>
      </header>
      <div className="container route-container">
        <nav id="section-tabs" className={`tabs route-sidebar${mobileMenuOpen ? " open" : ""}`} aria-label="Разделы сайта">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`tab-button${pathname === href ? " active" : ""}`}
              aria-current={pathname === href ? "page" : undefined}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Icon size={18} aria-hidden={true} /> <span>{label}</span>
            </Link>
          ))}
        </nav>
        <main className="route-content">{children}</main>
      </div>
    </>
  );
}

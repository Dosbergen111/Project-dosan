"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import ProfileSummary from "@/components/ProfileSummary";

export default function CheckoutPage() {
  const [message, setMessage] = useState("Никакого списания или изменения профиля не произойдёт.");
  const { account, refreshProfile } = useAuth();

  return (
    <div className="standalone-page">
      <header className="site-header">
        <h1>♔ Chess Master ♚</h1>
        <nav className="site-nav" aria-label="Основные страницы">
          <Link href="/">Игра</Link>
          <Link href="/pay">Premium</Link>
          <Link href="/checkout" aria-current="page">Оформление</Link>
        </nav>
        <div className="header-right"><ProfileSummary /></div>
      </header>
      <main className="page-content payment-layout">
        <section className="panel payment-card">
          <span className="page-badge">Учебная заглушка</span>
          <h2>Оформление Premium</h2>
          <p className="payment-price">399 <small>₸</small></p>
          <p className="page-note">
            Настоящий эквайринг не подключён. Не вводите платёжные данные: эта страница их не запрашивает и не принимает.
          </p>
          <div className="notice-box" role="status">{message}</div>
          <div className="page-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={async () => {
                try {
                  if (account) await refreshProfile();
                  setMessage("Демонстрация завершена: платёж не выполнялся, Premium не изменён.");
                } catch (error) {
                  console.error("Could not refresh profile after demo checkout:", error);
                  setMessage("Платёж не выполнялся. Не удалось обновить профиль; попробуйте позже.");
                }
              }}
            >
              Проверить учебную заглушку
            </button>
            <Link className="button button-secondary" href="/pay">Назад</Link>
            <Link className="button button-secondary" href="/">К игре</Link>
          </div>
        </section>
      </main>
    </div>
  );
}

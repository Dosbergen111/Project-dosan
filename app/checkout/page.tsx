"use client";

import Link from "next/link";
import ProfileSummary from "@/components/ProfileSummary";
import PremiumActivation from "@/components/PremiumActivation";

export default function CheckoutPage() {
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
          <span className="page-badge">Учебный режим</span>
          <h2>Оформление Premium</h2>
          <p className="payment-price">399 <small>₸</small></p>
          <p className="page-note">
            Учебный режим, списаний нет.
          </p>
          <div className="page-actions">
            <PremiumActivation />
            <Link className="button button-secondary" href="/pay">Назад на тариф</Link>
            <Link className="button button-secondary" href="/">К игре</Link>
          </div>
        </section>
      </main>
    </div>
  );
}

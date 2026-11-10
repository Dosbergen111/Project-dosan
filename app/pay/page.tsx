import Link from "next/link";
import ProfileSummary from "@/components/ProfileSummary";

export default function PayPage() {
  return (
    <div className="standalone-page">
      <header className="site-header">
        <h1>♔ Chess Master ♚</h1>
        <nav className="site-nav" aria-label="Основные страницы">
          <Link href="/">Игра</Link>
          <Link href="/pay" aria-current="page">Premium</Link>
          <Link href="/checkout">Оформление</Link>
        </nav>
        <div className="header-right"><ProfileSummary /></div>
      </header>
      <main className="page-content payment-layout">
        <section className="panel payment-card">
          <span className="page-badge">Учебная страница</span>
          <h2>Premium</h2>
          <p className="payment-price">399 <small>₸</small></p>
          <ul className="payment-features">
            <li>Бесконечная энергия</li>
            <li>Золотой VIP-бейдж</li>
            <li>Доступ к уровню «Гроссмейстер»</li>
            <li>Инструменты анализа партий</li>
            <li>Отключение рекламы</li>
          </ul>
          <div className="notice-box" role="note">
            Это демонстрационная заглушка. Платёж не принимается, карта не требуется, Premium не активируется.
          </div>
          <div className="page-actions">
            <Link className="button button-primary" href="/checkout">Посмотреть учебное оформление</Link>
            <Link className="button button-secondary" href="/">Вернуться к игре</Link>
          </div>
        </section>
      </main>
    </div>
  );
}

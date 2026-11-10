"use client";

import { useAuth } from "@/components/AuthProvider";

export default function ProfileSummary() {
  const { account } = useAuth();
  if (!account) return null;

  return (
    <div id="user-info">
      <span className="profile-chip">Игрок <strong id="user-name">{account.username}</strong></span>
      <span className="profile-chip">Рейтинг <strong id="user-elo">{account.elo}</strong></span>
      <span className="profile-chip">Энергия <strong id="user-energy">{account.is_premium ? "∞" : account.energy}</strong></span>
      <span className="profile-chip">Лига <strong id="user-league">{account.league}</strong></span>
      <span className="profile-chip">Premium <strong id="user-premium">{account.is_premium ? "Да" : "Нет"}</strong></span>
      {account.is_premium && <span className="vip-badge">👑 VIP</span>}
    </div>
  );
}

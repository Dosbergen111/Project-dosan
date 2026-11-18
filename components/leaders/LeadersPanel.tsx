"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

type Leader = { username: string; elo: number; league: string; rank: number; is_premium: boolean };

export default function LeadersPanel() {
  const { account } = useAuth();
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    void fetch(`/api/leaderboard${account ? `?userId=${account.id}` : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { leaderboard?: Leader[]; userRank?: { rank: number; elo: number; league: string } | null; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Ошибка загрузки лидеров.");
        setLeaders(data.leaderboard ?? []);
        setMessage(data.userRank ? `Ваше место: #${data.userRank.rank} · ${data.userRank.elo} Elo · ${data.userRank.league}` : "");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Ошибка загрузки лидеров."));
  }, [account, refresh]);

  return (
    <section className="tab-content active">
      <div className="leaderboard-panel">
        <h2>🏆 Таблица Лидеров</h2>
        <div className="leaderboard-user-rank">{message}</div>
        <ol className="leaderboard-list">
          {leaders.map((player, index) => (
            <li className={`leaderboard-item${index < 3 ? " top3" : ""}`} key={`${player.username}-${index}`}>
              <span className="leaderboard-rank">{player.rank}</span>
              <span className="leaderboard-name">{player.username}{player.is_premium && <span className="vip-badge leaderboard-vip">👑 VIP</span>}</span>
              <span className="leaderboard-league">{player.league}</span>
              <span className="leaderboard-elo">{player.elo}</span>
            </li>
          ))}
          {!leaders.length && <li className="leaderboard-loading">{message || "Загрузка лидеров..."}</li>}
        </ol>
        <button onClick={() => { setMessage(""); setLeaders([]); setRefresh((count) => count + 1); }} className="refresh-btn">🔄 Обновить</button>
      </div>
    </section>
  );
}

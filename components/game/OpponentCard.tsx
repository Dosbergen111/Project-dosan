"use client";

import { useGame } from "@/components/chess/GameProvider";
import { levelByDifficulty } from "@/lib/chess/levels";

export default function OpponentCard() {
  const game = useGame();
  const level = levelByDifficulty(game.activeDifficulty);

  return (
    <section className="play-card opponent-card">
      <h2 className="play-section-title">Соперник</h2>
      <div className="opponent-name">Компьютер</div>
      <div className="opponent-elo">{level.elo} Elo</div>
      <div className="opponent-level">{level.label}</div>
    </section>
  );
}

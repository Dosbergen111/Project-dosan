"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/chess/GameProvider";
import {
  LiaChessKingSolid,
  LiaChessQueenSolid,
} from "react-icons/lia";

export default function GameSettings() {
  const { account } = useAuth();
  const game = useGame();
  const timeOptions = [60, 180, 300, 600, 900, 1800];
  const gameModes = [
    { id: "pvp" as const, label: "Человек" },
    { id: "pvc" as const, label: "Компьютер" },
  ];
  const colors = [
    { id: "white" as const, label: "Белые", Icon: LiaChessKingSolid },
    { id: "black" as const, label: "Чёрные", Icon: LiaChessQueenSolid },
  ];
  const levels = [
    { label: "Новичок", value: 1 },
    { label: "Средний", value: 5 },
    { label: "Мастер", value: 10 },
    { label: "Гроссмейстер", value: 20 },
  ];

  return (
    <section className="play-card game-settings">
      <h2 className="play-section-title">Партия</h2>
      <div className="game-setting-group">
        <h3>Время</h3>
        <div className="game-option-group">
          {timeOptions.map((seconds) => (
            <button key={seconds} type="button" className={game.selectedTime === seconds ? "success" : ""} aria-pressed={game.selectedTime === seconds} onClick={() => game.setTime(seconds)}>
              {seconds / 60}
            </button>
          ))}
          <span className="game-option-unit">мин</span>
        </div>
      </div>
      <div className="game-setting-group">
        <h3>Режим</h3>
        <div className="game-option-group">
          {gameModes.map(({ id, label }) => (
            <button key={id} type="button" className={game.gameMode === id ? "success" : ""} disabled={game.partyInProgress} aria-pressed={game.gameMode === id} onClick={() => game.changeGameMode(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="game-setting-group">
        <h3>Цвет</h3>
        <div className="game-option-group">
          {colors.map(({ id, label, Icon }) => (
            <button key={id} type="button" className={game.playerColor === id ? "success" : ""} disabled={game.partyInProgress} aria-pressed={game.playerColor === id} onClick={() => game.changePlayerColor(id)}>
              <Icon aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="game-setting-group">
        <h3>Уровень</h3>
        <div className="game-option-group game-level-options">
          {levels.map(({ label, value }) => {
            const premiumOnly = value === 20 && account?.is_premium !== true;
            return (
              <button key={value} type="button" className={game.difficulty === value ? "success" : ""} disabled={game.partyInProgress || premiumOnly} aria-pressed={game.difficulty === value} onClick={() => game.changeDifficulty(value)}>
                <span>{label}</span>
                {premiumOnly && <small>только Premium</small>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

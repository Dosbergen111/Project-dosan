"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/chess/GameProvider";
import { stateToFen } from "@/lib/chess/board";
import {
  LiaBookOpenSolid,
  LiaChessBoardSolid,
  LiaChessKingSolid,
  LiaHistorySolid,
  LiaPuzzlePieceSolid,
  LiaSearchSolid,
  LiaTimesSolid,
} from "react-icons/lia";

export default function GameActions() {
  const { account } = useAuth();
  const game = useGame();
  const [fenInput, setFenInput] = useState("");
  const [fenMessage, setFenMessage] = useState("");
  const hintsRemaining = Math.max(0, (account?.is_premium ? Infinity : 3) - game.hintsUsed);

  function exportMoves() {
    const content = `1. ${game.moves.join(" ")}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "chess-game.pgn";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function copyFen() {
    await navigator.clipboard.writeText(stateToFen(game.game));
  }

  function requestHint() {
    if (game.gameMode !== "pvc" || game.gameResult || game.botTurn || !game.legalMoves.length) return;
    const limit = account?.is_premium ? Infinity : 3;
    if (game.hintsUsed >= limit) return;
    const move = game.legalMoves[0];
    game.setSelection(move.from);
    game.setHintMessage(`Попробуйте ${String.fromCharCode(97 + move.from.col)}${8 - move.from.row} → ${String.fromCharCode(97 + move.to.col)}${8 - move.to.row}.`);
    game.setHintsUsed((used) => used + 1);
  }

  return (
    <section className="play-card game-actions">
      <h2 className="play-section-title">Действия</h2>
      <div className="game-action-grid">
        <button type="button" className="primary" onClick={game.startNewGame}><LiaChessBoardSolid aria-hidden="true" /> Новая игра</button>
        <button type="button" onClick={game.undoMove} disabled={!game.past.length || game.botTurn || Boolean(game.gameResult)}><LiaHistorySolid aria-hidden="true" /> Отменить</button>
        <button type="button" className="danger" onClick={() => game.setGameResult("loss")} disabled={Boolean(game.gameResult) || !game.partyStarted}><LiaChessKingSolid aria-hidden="true" /> Сдаться</button>
        <button type="button" onClick={() => game.setGameResult("draw")} disabled={Boolean(game.gameResult) || !game.partyStarted}><LiaTimesSolid aria-hidden="true" /> Ничья</button>
        <button type="button" onClick={requestHint} disabled={game.gameMode !== "pvc" || Boolean(game.gameResult) || game.botTurn || !game.legalMoves.length || hintsRemaining === 0}>
          <LiaPuzzlePieceSolid aria-hidden="true" /> Подсказка
        </button>
        <button type="button" onClick={exportMoves}><LiaBookOpenSolid aria-hidden="true" /> PGN</button>
        <button type="button" onClick={copyFen}><LiaSearchSolid aria-hidden="true" /> FEN</button>
      </div>
      {game.hintMessage && <small className="secondary-text game-hint-message" role="status">{game.hintMessage}</small>}
      <div className="fen-controls game-fen-controls">
        <input value={fenInput} onChange={(event) => setFenInput(event.target.value)} placeholder="Вставьте FEN позицию..." aria-label="FEN позиция" />
        <button type="button" onClick={() => { setFenMessage(game.loadFenPosition(fenInput) ? "" : "Некорректная FEN-позиция."); }}>Загрузить позицию</button>
        {fenMessage && <p role="status">{fenMessage}</p>}
      </div>
    </section>
  );
}

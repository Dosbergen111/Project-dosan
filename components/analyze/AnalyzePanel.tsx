"use client";

import Board from "@/components/chess/Board";
import { useGame } from "@/components/chess/GameProvider";
import { getLegalMoves } from "@/lib/chess/rules";
import { LiaSearchSolid } from "react-icons/lia";

const values = { king: 0, queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1 };

export default function AnalyzePanel() {
  const game = useGame();
  const states = [...game.past.map((snapshot) => snapshot.game), game.game];
  const index = Math.min(game.past.length, states.length - 1);
  const position = states[index] ?? game.game;
  const balance = position.board.flat().reduce((score, piece) => score + (piece ? (piece.color === "white" ? 1 : -1) * values[piece.type] : 0), 0);

  return (
    <section className="tab-content active">
      <div className="analyze-panel">
        <h2><LiaSearchSolid aria-hidden="true" /> Анализ партии</h2>
        <p className="analysis-note">Просмотр ходов партии и оценка материала.</p>
        <div className="stats-grid">
          <div className="stat-box"><label>Оценка материала:</label><div>{balance > 0 ? `+${balance}` : balance}</div></div>
          <div className="stat-box"><label>Легальных ходов:</label><div>{getLegalMoves(position).length}</div></div>
        </div>
        <Board game={position} legalMoves={getLegalMoves(position)} selection={null} size="small" boardStyle="default" boardId="analysis-board" coordinatesShown disabled onSquareClick={() => undefined} />
        <h3>Ходы партии:</h3>
        <div>{game.moves.join(" ") || "Начните игру, чтобы просмотреть ходы."}</div>
      </div>
    </section>
  );
}

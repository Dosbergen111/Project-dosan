"use client";

import { useGame } from "@/components/chess/GameProvider";
import Board from "@/components/chess/Board";
import GameAuthModal from "@/components/game/GameAuthModal";
import GameActions from "@/components/game/GameActions";
import GameSettings from "@/components/game/GameSettings";
import OpponentCard from "@/components/game/OpponentCard";
import { levelByDifficulty } from "@/lib/chess/levels";
import { LiaChessBoardSolid, LiaChessKingSolid, LiaChessQueenSolid } from "react-icons/lia";

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function PlayPanel() {
  const game = useGame();

  const movePairs = Array.from({ length: Math.ceil(game.moves.length / 2) }, (_, index) => ({
    number: index + 1,
    white: game.moves[index * 2],
    black: game.moves[index * 2 + 1],
  }));
  const statusText = game.botThinking
    ? `Думает · ${levelByDifficulty(game.activeDifficulty).label}`
    : game.outcome
    ? game.outcome === "checkmate"
      ? game.game.turn === game.playerColor ? "Мат — вы проиграли!" : "Мат — вы победили!"
      : "Ничья."
    : `${game.check ? "Шах! " : ""}Ход ${game.game.turn === "white" ? "белых" : "чёрных"}${game.botTurn ? " — компьютер думает…" : ""}`;
  const material = game.game.board.flat().reduce((total, piece) => {
    if (!piece) return total;
    const values = { king: 0, queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1 };
    total[piece.color] += values[piece.type];
    return total;
  }, { white: 0, black: 0 });

  return (
    <>
      <GameAuthModal />
      <section id="game" className="tab-content active">
        <div className="play-layout">
          <div className="play-board-column">
            <div className="game-top-panel">
              <div className="status" aria-live="polite">{statusText}</div>
              <div className="timer-display">
                <div className="timer-white"><span className="timer-label"><LiaChessKingSolid aria-hidden="true" /> Белые</span><span className="timer-value">{formatTime(game.whiteTime)}</span></div>
                <div className="timer-black"><span className="timer-label"><LiaChessQueenSolid aria-hidden="true" /> Чёрные</span><span className="timer-value">{formatTime(game.blackTime)}</span></div>
              </div>
              <div className="board-size-quick">
                <label><LiaChessBoardSolid aria-hidden="true" /> Размер:</label>
                {(["small", "medium", "large"] as const).map((size) => (
                  <button key={size} className={`size-btn${game.boardSize === size ? " active" : ""}`} onClick={() => game.setBoardSize(size)}>
                    {size === "small" ? "S" : size === "medium" ? "M" : "L"}
                  </button>
                ))}
              </div>
            </div>
            <div className="board-wrapper">
              <Board
                game={game.game}
                legalMoves={game.legalMoves}
                selection={game.selection}
                size={game.boardSize}
                boardStyle={game.boardStyle}
                coordinatesShown={game.coordinatesShown}
                disabled={Boolean(game.gameResult) || game.botTurn}
                onSquareClick={game.handleSquareClick}
              />
              {game.materialShown && <div className="material-balance"><span>{material.white}</span><span>{material.black}</span></div>}
            </div>
            <div className="moves-panel">
              <div className="current-moves">
                {movePairs.length ? movePairs.map((pair) => <span className="move" key={pair.number}>{pair.number}. {pair.white} {pair.black ?? "…"}</span>) : <span className="no-games">Сделайте первый ход.</span>}
              </div>
              {game.gameResult && <p className="game-record-result">{game.gameResult === "win" ? "Победа" : game.gameResult === "loss" ? "Поражение" : "Ничья"}</p>}
              {game.autoSaveState && <p className="chat-note" aria-live="polite">{game.autoSaveState}</p>}
            </div>
          </div>
          <aside className="play-sidebar">
            <GameSettings />
            <OpponentCard />
            <GameActions />
          </aside>
        </div>
      </section>
    </>
  );
}

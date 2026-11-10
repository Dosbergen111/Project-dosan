"use client";

import { useEffect, useMemo, useState } from "react";
import { squareName, stateFromFen } from "@/lib/chess/board";
import { DAILY_PUZZLES } from "@/lib/chess/puzzles";
import { moveToUci } from "@/lib/chess/moves";
import { getLegalMoves, makeMove } from "@/lib/chess/rules";
import type { GameState, Square } from "@/lib/chess/types";

type Props = { userId: number | null };

function todayKey(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function pieces(state: GameState) {
  return state.board.flatMap((rank) => rank.map((piece) => piece));
}

const SYMBOLS = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" },
};

export default function PuzzlePanel({ userId }: Props) {
  const [storageKey, setStorageKey] = useState(
    `dailyPuzzleProgress:loading:${userId ?? "guest"}`,
  );
  const [solved, setSolved] = useState(0);
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<Square | null>(null);
  const [feedback, setFeedback] = useState("");
  const [highlight, setHighlight] = useState<{ from: Square; to: Square } | null>(null);

  const puzzle = DAILY_PUZZLES[solved];
  const position = useMemo(
    () => puzzle ? stateFromFen(puzzle.fen) : null,
    [puzzle],
  );
  const legalMoves = useMemo(
    () => (position ? getLegalMoves(position) : []),
    [position],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const key = `dailyPuzzleProgress:${todayKey()}:${userId ?? "guest"}`;
      let restored = 0;
      try {
        const saved = Number(localStorage.getItem(key) ?? 0);
        if (Number.isInteger(saved) && saved >= 0 && saved <= DAILY_PUZZLES.length) {
          restored = saved;
        }
      } catch (error) {
        console.error("Could not read puzzle progress:", error);
      }
      setStorageKey(key);
      setSolved(restored);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userId]);

  function clickSquare(row: number, col: number) {
    if (!ready || !position || !puzzle || solved >= DAILY_PUZZLES.length) return;
    const piece = position.board[row][col];
    if (!selection) {
      if (piece?.color === "white") {
        setFeedback("");
        setSelection({ row, col });
      }
      return;
    }
    if (selection.row === row && selection.col === col) {
      setSelection(null);
      return;
    }
    if (piece?.color === "white") {
      setSelection({ row, col });
      return;
    }

    const move = legalMoves.find(
      (candidate) =>
        candidate.from.row === selection.row &&
        candidate.from.col === selection.col &&
        candidate.to.row === row &&
        candidate.to.col === col,
    );
    if (!move || moveToUci(move) !== puzzle.move) {
      const from = selection;
      const to = { row, col };
      setSelection(null);
      setHighlight({ from, to });
      setFeedback(`Неверно. Правильный ход: ${puzzle.move.slice(0, 2)} → ${puzzle.move.slice(2, 4)}. ${puzzle.comment}`);
      return;
    }

    const next = makeMove(position, move);
    if (!next) return;
    setSelection(null);
    setHighlight(null);
    setFeedback(`Верно! +1 очко. ${puzzle.comment}`);
    const nextCount = solved + 1;
    setSolved(nextCount);
    try {
      localStorage.setItem(storageKey, String(nextCount));
    } catch (error) {
      console.error("Could not save puzzle progress:", error);
    }
  }

  return (
    <div className="puzzles-panel">
      <h2>🧩 Задачи дня</h2>
      <p className="puzzle-progress">Очки сегодня: {ready ? solved : 0} / {DAILY_PUZZLES.length}</p>
      <p className="puzzle-status" aria-live="polite">
        {!ready
          ? "Загрузка задач…"
          : solved >= DAILY_PUZZLES.length
            ? "На сегодня все задачи решены. Возвращайтесь завтра за новым прогрессом."
            : `Задача ${solved + 1} из ${DAILY_PUZZLES.length}. Найдите лучший ход белых.`}
      </p>
      {puzzle && position && (
        <div id="puzzle-board" className="puzzle-board" aria-label="Шахматная доска задачи">
          {pieces(position).map((piece, index) => {
            const row = Math.floor(index / 8);
            const col = index % 8;
            const selected = selection?.row === row && selection.col === col;
            const legal = selection && legalMoves.some(
              (move) => move.from.row === selection.row &&
                move.from.col === selection.col &&
                move.to.row === row && move.to.col === col,
            );
            const selectedMove = highlight?.from.row === row && highlight.from.col === col;
            const targetMove = highlight?.to.row === row && highlight.to.col === col;

            return (
              <div
                key={`${row}-${col}`}
                role="button"
                tabIndex={0}
                aria-label={`${squareName({ row, col })}${piece ? ` ${piece.color} ${piece.type}` : ""}`}
                className={[
                  "puzzle-square",
                  (row + col) % 2 === 0 ? "light" : "dark",
                  selected ? "selected" : "",
                  legal ? "possible" : "",
                  selectedMove ? "puzzle-correct-from" : "",
                  targetMove ? "puzzle-correct-to" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => clickSquare(row, col)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    clickSquare(row, col);
                  }
                }}
              >
                {piece ? SYMBOLS[piece.color][piece.type] : ""}
              </div>
            );
          })}
        </div>
      )}
      <p className="puzzle-feedback" aria-live="polite">{feedback}</p>
      {puzzle && <p className="puzzle-comment">{puzzle.comment}</p>}
    </div>
  );
}

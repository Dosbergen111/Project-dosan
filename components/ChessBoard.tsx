"use client";

import type { ChessMove, GameState, Piece } from "@/lib/chess/types";

const PIECE_SYMBOLS: Record<Piece["color"], Record<Piece["type"], string>> = {
  white: {
    king: "♔",
    queen: "♕",
    rook: "♖",
    bishop: "♗",
    knight: "♘",
    pawn: "♙",
  },
  black: {
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟",
  },
};

type Props = {
  game: GameState;
  legalMoves: ChessMove[];
  selection: { row: number; col: number } | null;
  size: "small" | "medium" | "large";
  boardStyle: string;
  boardId?: string;
  coordinatesShown: boolean;
  disabled: boolean;
  onSquareClick: (row: number, col: number) => void;
};

export default function ChessBoard({
  game,
  legalMoves,
  selection,
  size,
  boardStyle,
  boardId = "board",
  coordinatesShown,
  disabled,
  onSquareClick,
}: Props) {
  const destinations = selection
    ? legalMoves.filter(
        (move) =>
          move.from.row === selection.row && move.from.col === selection.col,
      )
    : [];

  return (
    <div className={`board-grid-wrapper board-size-${size}`}>
      <div className="board-corner" />
      {"ABCDEFGH".split("").map((file) => (
        <div className="col-label" key={`col-${file}`}>
          {coordinatesShown ? file : ""}
        </div>
      ))}
      {[8, 7, 6, 5, 4, 3, 2, 1].map((rank) => (
        <div className="row-label" key={`row-${rank}`}>
          {coordinatesShown ? rank : ""}
        </div>
      ))}
      <div className={`board board-style-${boardStyle}`} id={boardId} role="grid" aria-label="Шахматная доска">
        {game.board.flatMap((rank, row) =>
          rank.map((piece, col) => {
            const selected = selection?.row === row && selection.col === col;
            const possible = destinations.some(
              (move) => move.to.row === row && move.to.col === col,
            );
            const name = `${String.fromCharCode(97 + col)}${8 - row}`;

            return (
              <div
                key={`${row}-${col}`}
                role="gridcell"
                aria-label={`${name}${piece ? ` ${piece.color} ${piece.type}` : ""}`}
                aria-disabled={disabled}
                aria-selected={selected}
                tabIndex={disabled ? -1 : 0}
                className={[
                  "square",
                  (row + col) % 2 === 0 ? "light" : "dark",
                  selected ? "selected" : "",
                  possible ? "possible" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSquareClick(row, col)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSquareClick(row, col);
                  }
                }}
              >
                {piece && (
                  <span className={piece.color === "white" ? "white-piece" : "black-piece"}>
                    {PIECE_SYMBOLS[piece.color][piece.type]}
                  </span>
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

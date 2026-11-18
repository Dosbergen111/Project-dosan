"use client";

import type { ChessMove, GameState, Piece, PieceColor } from "@/lib/chess/types";

const PIECE_SYMBOLS: Record<Piece["color"], Record<Piece["type"], string>> = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" },
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
  orientation?: PieceColor;
};

export default function Board(props: Props) {
  const destinations = props.selection
    ? props.legalMoves.filter((move) =>
        move.from.row === props.selection?.row && move.from.col === props.selection?.col,
      )
    : [];

  const orientation = props.orientation ?? "white";
  const displayRows = orientation === "black" ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const displayCols = orientation === "black" ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div className={`board-grid-wrapper board-size-${props.size}`}>
      <div className={`board board-style-${props.boardStyle}`} id={props.boardId ?? "board"} role="grid" aria-label="Шахматная доска">
        {displayRows.flatMap((row, visualRow) =>
          displayCols.map((col, visualCol) => {
            const piece = props.game.board[row][col];
            const name = `${String.fromCharCode(97 + col)}${8 - row}`;
            const selected = props.selection?.row === row && props.selection.col === col;
            const possible = destinations.some((move) => move.to.row === row && move.to.col === col);
            return (
              <div
                key={`${row}-${col}`}
                role="gridcell"
                aria-label={`${name}${piece ? ` ${piece.color} ${piece.type}` : ""}`}
                aria-disabled={props.disabled}
                aria-selected={selected}
                tabIndex={props.disabled ? -1 : 0}
                className={`square ${(row + col) % 2 === 0 ? "light" : "dark"}${selected ? " selected" : ""}${possible ? " possible" : ""}`}
                onClick={() => props.onSquareClick(row, col)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    props.onSquareClick(row, col);
                  }
                }}
              >
                {props.coordinatesShown && visualCol === 0 && (
                  <span className="square-rank" aria-hidden="true">{8 - row}</span>
                )}
                {props.coordinatesShown && visualRow === 7 && (
                  <span className="square-file" aria-hidden="true">{String.fromCharCode(97 + col)}</span>
                )}
                {piece && <span className={piece.color === "white" ? "white-piece" : "black-piece"}>
                  {PIECE_SYMBOLS[piece.color][piece.type]}
                </span>}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

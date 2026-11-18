"use client";

import type { ChessMove, GameState, Piece } from "@/lib/chess/types";

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
};

export default function Board(props: Props) {
  const destinations = props.selection
    ? props.legalMoves.filter((move) =>
        move.from.row === props.selection?.row && move.from.col === props.selection?.col,
      )
    : [];

  return (
    <div className={`board-grid-wrapper board-size-${props.size}`}>
      <div className="board-corner" />
      {"ABCDEFGH".split("").map((file) => (
        <div className="col-label" key={file}>{props.coordinatesShown ? file : ""}</div>
      ))}
      {[8, 7, 6, 5, 4, 3, 2, 1].map((rank) => (
        <div className="row-label" key={rank}>{props.coordinatesShown ? rank : ""}</div>
      ))}
      <div className={`board board-style-${props.boardStyle}`} id={props.boardId ?? "board"} role="grid" aria-label="Шахматная доска">
        {props.game.board.flatMap((rank, row) =>
          rank.map((piece, col) => {
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

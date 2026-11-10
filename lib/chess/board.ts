import type { Board, GameState, PieceColor, PieceType, Square } from "@/lib/chess/types";

const BACK_RANK: PieceType[] = [
  "rook",
  "knight",
  "bishop",
  "queen",
  "king",
  "bishop",
  "knight",
  "rook",
];

export function createInitialState(): GameState {
  const board: Board = Array.from({ length: 8 }, () => Array<null>(8).fill(null));

  for (let col = 0; col < 8; col += 1) {
    board[0][col] = { type: BACK_RANK[col], color: "black" };
    board[1][col] = { type: "pawn", color: "black" };
    board[6][col] = { type: "pawn", color: "white" };
    board[7][col] = { type: BACK_RANK[col], color: "white" };
  }

  return {
    board,
    turn: "white",
    castlingRights: {
      white: { kingSide: true, queenSide: true },
      black: { kingSide: true, queenSide: true },
    },
    enPassant: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
  };
}

export function squareName(square: Square): string {
  return `${String.fromCharCode(97 + square.col)}${8 - square.row}`;
}

export function stateToFen(state: GameState): string {
  const rows = state.board.map((rank) => {
    let fenRank = "";
    let emptyCount = 0;

    for (const piece of rank) {
      if (!piece) {
        emptyCount += 1;
        continue;
      }

      if (emptyCount > 0) {
        fenRank += emptyCount;
        emptyCount = 0;
      }

      const symbol = {
        king: "k",
        queen: "q",
        rook: "r",
        bishop: "b",
        knight: "n",
        pawn: "p",
      }[piece.type];
      fenRank += piece.color === "white" ? symbol.toUpperCase() : symbol;
    }

    return fenRank + (emptyCount > 0 ? emptyCount : "");
  });

  const castling = [
    state.castlingRights.white.kingSide ? "K" : "",
    state.castlingRights.white.queenSide ? "Q" : "",
    state.castlingRights.black.kingSide ? "k" : "",
    state.castlingRights.black.queenSide ? "q" : "",
  ].join("");

  return [
    rows.join("/"),
    state.turn === "white" ? "w" : "b",
    castling || "-",
    state.enPassant ? squareName(state.enPassant) : "-",
    state.halfmoveClock,
    state.fullmoveNumber,
  ].join(" ");
}

export function stateFromFen(fen: string): GameState | null {
  const [position, activeColor, castling, enPassant, halfmove, fullmove] = fen
    .trim()
    .split(/\s+/);
  if (!position || !["w", "b"].includes(activeColor) || !castling || !enPassant) {
    return null;
  }

  const pieceTypes: Record<string, PieceType> = {
    k: "king",
    q: "queen",
    r: "rook",
    b: "bishop",
    n: "knight",
    p: "pawn",
  };
  const ranks = position.split("/");
  if (ranks.length !== 8) return null;
  const board: Board = [];

  for (const rank of ranks) {
    const row: Board[number] = [];
    for (const cell of rank) {
      const emptyCount = Number(cell);
      if (Number.isInteger(emptyCount) && emptyCount >= 1 && emptyCount <= 8) {
        row.push(...Array<null>(emptyCount).fill(null));
      } else {
        const type = pieceTypes[cell.toLowerCase()];
        if (!type) return null;
        row.push({
          type,
          color: cell === cell.toUpperCase() ? "white" : "black",
        });
      }
    }
    if (row.length !== 8) return null;
    board.push(row);
  }

  const epMatch = enPassant === "-" ? null : enPassant.match(/^([a-h])([1-8])$/);
  if (enPassant !== "-" && !epMatch) return null;
  const halfmoveClock = Number(halfmove ?? 0);
  const fullmoveNumber = Number(fullmove ?? 1);
  if (
    !Number.isSafeInteger(halfmoveClock) ||
    halfmoveClock < 0 ||
    !Number.isSafeInteger(fullmoveNumber) ||
    fullmoveNumber < 1
  ) {
    return null;
  }

  return {
    board,
    turn: activeColor === "w" ? "white" : "black",
    castlingRights: {
      white: {
        kingSide: castling.includes("K"),
        queenSide: castling.includes("Q"),
      },
      black: {
        kingSide: castling.includes("k"),
        queenSide: castling.includes("q"),
      },
    },
    enPassant: epMatch
      ? { row: 8 - Number(epMatch[2]), col: epMatch[1].charCodeAt(0) - 97 }
      : null,
    halfmoveClock,
    fullmoveNumber,
  };
}

export function oppositeColor(color: PieceColor): PieceColor {
  return color === "white" ? "black" : "white";
}

import { squareName } from "@/lib/chess/board";
import type { ChessMove } from "@/lib/chess/types";
import type { Square } from "@/lib/chess/types";

export function moveToUci(move: ChessMove): string {
  return `${squareName(move.from)}${squareName(move.to)}${
    move.promotion ? move.promotion[0] : ""
  }`;
}

export function squareFromName(name: string): Square | null {
  const match = /^([a-h])([1-8])$/.exec(name);
  if (!match) return null;
  return { row: 8 - Number(match[2]), col: match[1].charCodeAt(0) - 97 };
}

export function uciToMove(uci: string): ChessMove | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  const from = squareFromName(uci.slice(0, 2));
  const to = squareFromName(uci.slice(2, 4));
  if (!from || !to) return null;
  const promotion = uci[4] as "q" | "r" | "b" | "n" | undefined;
  const types = { q: "queen", r: "rook", b: "bishop", n: "knight" } as const;
  return {
    from,
    to,
    ...(promotion ? { promotion: types[promotion] } : {}),
  };
}

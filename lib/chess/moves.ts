import { squareName } from "@/lib/chess/board";
import type { ChessMove } from "@/lib/chess/types";

export function moveToUci(move: ChessMove): string {
  return `${squareName(move.from)}${squareName(move.to)}${
    move.promotion ? move.promotion[0] : ""
  }`;
}

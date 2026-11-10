import { applyMove } from "@/lib/chess/rules";
import { squareName } from "@/lib/chess/board";
import type { ChessMove, GameState, PieceColor, PieceType } from "@/lib/chess/types";
import { getLegalMoves, isInCheck } from "@/lib/chess/rules";

const PIECE_VALUES: Record<PieceType, number> = {
  king: 20_000,
  queen: 900,
  rook: 500,
  bishop: 330,
  knight: 320,
  pawn: 100,
};

export function moveToUci(move: ChessMove): string {
  return `${squareName(move.from)}${squareName(move.to)}${
    move.promotion ? move.promotion[0] : ""
  }`;
}

function evaluate(state: GameState): number {
  let score = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (!piece) continue;
      const value = PIECE_VALUES[piece.type];
      score += piece.color === "black" ? value : -value;
    }
  }
  return score;
}

function movePriority(state: GameState, move: ChessMove): number {
  const movingPiece = state.board[move.from.row][move.from.col];
  const capturedPiece = state.board[move.to.row][move.to.col];
  const captureScore = capturedPiece
    ? PIECE_VALUES[capturedPiece.type] * 10 - (movingPiece ? PIECE_VALUES[movingPiece.type] : 0)
    : 0;
  const promotionScore = move.promotion ? PIECE_VALUES[move.promotion] : 0;
  return captureScore + promotionScore;
}

function orderedMoves(state: GameState, moves: ChessMove[]): ChessMove[] {
  return moves.sort(
    (left, right) =>
      movePriority(state, right) - movePriority(state, left) ||
      left.from.row - right.from.row ||
      left.from.col - right.from.col ||
      left.to.row - right.to.row ||
      left.to.col - right.to.col,
  );
}

function search(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  botColor: PieceColor,
): number {
  const score = (position: GameState) =>
    evaluate(position) * (botColor === "black" ? 1 : -1);
  if (depth === 0) return score(state);

  const moves = orderedMoves(state, getLegalMoves(state));
  if (moves.length === 0) {
    if (!isInCheck(state.board, state.turn)) return 0;
    return state.turn === botColor ? -30_000 - depth : 30_000 + depth;
  }

  if (state.turn === botColor) {
    let best = -Infinity;
    for (const move of moves) {
      const nextState = applyMove(state, move);
      best = Math.max(best, search(nextState, depth - 1, alpha, beta, botColor));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    const nextState = applyMove(state, move);
    best = Math.min(best, search(nextState, depth - 1, alpha, beta, botColor));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseBotMove(
  state: GameState,
  difficulty: number,
  botColor: PieceColor = "black",
): ChessMove | null {
  const moves = getLegalMoves(state, botColor);
  if (moves.length === 0) return null;
  if (difficulty <= 2 && Math.random() < 0.3) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const depth = difficulty <= 2 ? 2 : difficulty <= 5 ? 4 : difficulty <= 10 ? 5 : 6;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  let bestMoves: ChessMove[] = [];

  for (const move of orderedMoves(state, moves)) {
    const nextState = applyMove(state, move);
    const score = search(nextState, depth - 1, alpha, Infinity, botColor);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
    alpha = Math.max(alpha, bestScore);
  }

  if (difficulty >= 20) return bestMoves[0] ?? moves[0];
  return bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? moves[0];
}

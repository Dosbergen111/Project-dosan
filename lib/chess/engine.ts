import { applyMove, getLegalMoves, isInCheck } from "@/lib/chess/rules";
import { levelByDifficulty } from "@/lib/chess/levels";
import type { ChessMove, GameState, PieceColor, PieceType } from "@/lib/chess/types";

const PIECE_VALUES: Record<PieceType, number> = {
  king: 20_000,
  queen: 900,
  rook: 500,
  bishop: 330,
  knight: 320,
  pawn: 100,
};

function evaluate(state: GameState): number {
  let score = 0;
  for (const rank of state.board) {
    for (const piece of rank) {
      if (!piece) continue;
      score += (piece.color === "black" ? 1 : -1) * PIECE_VALUES[piece.type];
    }
  }
  return score;
}

function movePriority(state: GameState, move: ChessMove): number {
  const moving = state.board[move.from.row][move.from.col];
  const captured = state.board[move.to.row][move.to.col];
  return (captured ? PIECE_VALUES[captured.type] * 10 - (moving ? PIECE_VALUES[moving.type] : 0) : 0)
    + (move.promotion ? PIECE_VALUES[move.promotion] : 0);
}

function orderedMoves(state: GameState, moves: ChessMove[]): ChessMove[] {
  return [...moves].sort((left, right) =>
    movePriority(state, right) - movePriority(state, left)
    || left.from.row - right.from.row
    || left.from.col - right.from.col
    || left.to.row - right.to.row
    || left.to.col - right.to.col,
  );
}

function search(state: GameState, depth: number, alpha: number, beta: number, botColor: PieceColor): number {
  const score = (position: GameState) => evaluate(position) * (botColor === "black" ? 1 : -1);
  if (depth === 0) return score(state);

  const moves = orderedMoves(state, getLegalMoves(state));
  if (moves.length === 0) {
    if (!isInCheck(state.board, state.turn)) return 0;
    return state.turn === botColor ? -30_000 - depth : 30_000 + depth;
  }

  if (state.turn === botColor) {
    let best = -Infinity;
    for (const move of moves) {
      best = Math.max(best, search(applyMove(state, move), depth - 1, alpha, beta, botColor));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    best = Math.min(best, search(applyMove(state, move), depth - 1, alpha, beta, botColor));
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
  const level = levelByDifficulty(difficulty);
  if (Math.random() < level.randomMoveRatio) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  let bestScore = -Infinity;
  let alpha = -Infinity;
  let bestMoves: ChessMove[] = [];
  for (const move of orderedMoves(state, moves)) {
    const score = search(applyMove(state, move), level.depth - 1, alpha, Infinity, botColor);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
    alpha = Math.max(alpha, bestScore);
  }

  if (level.skill >= 20) return bestMoves[0] ?? moves[0];
  return bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? moves[0];
}

import { oppositeColor } from "@/lib/chess/board";
import type {
  Board,
  ChessMove,
  GameState,
  PieceColor,
  PieceType,
  Square,
} from "@/lib/chess/types";

const KNIGHT_STEPS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
] as const;
const KING_STEPS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;
const BISHOP_DIRECTIONS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;
const ROOK_DIRECTIONS = [
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, 0],
] as const;

function isInside(square: Square): boolean {
  return square.row >= 0 && square.row < 8 && square.col >= 0 && square.col < 8;
}

function findKing(board: Board, color: PieceColor): Square | null {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece?.type === "king" && piece.color === color) return { row, col };
    }
  }
  return null;
}

export function isSquareAttacked(
  board: Board,
  square: Square,
  byColor: PieceColor,
): boolean {
  const pawnSourceRow = square.row + (byColor === "white" ? 1 : -1);
  for (const colOffset of [-1, 1]) {
    const piece = board[pawnSourceRow]?.[square.col + colOffset];
    if (piece?.type === "pawn" && piece.color === byColor) return true;
  }

  for (const [rowOffset, colOffset] of KNIGHT_STEPS) {
    const piece = board[square.row + rowOffset]?.[square.col + colOffset];
    if (piece?.type === "knight" && piece.color === byColor) return true;
  }

  for (const [rowOffset, colOffset] of KING_STEPS) {
    const piece = board[square.row + rowOffset]?.[square.col + colOffset];
    if (piece?.type === "king" && piece.color === byColor) return true;
  }

  const slidingPieces: {
    directions: readonly (readonly [number, number])[];
    attackers: readonly PieceType[];
  }[] = [
    { directions: BISHOP_DIRECTIONS, attackers: ["bishop", "queen"] },
    { directions: ROOK_DIRECTIONS, attackers: ["rook", "queen"] },
  ];
  for (const { directions, attackers } of slidingPieces) {
    for (const [rowOffset, colOffset] of directions) {
      let row = square.row + rowOffset;
      let col = square.col + colOffset;

      while (isInside({ row, col })) {
        const piece = board[row][col];
        if (piece) {
          if (piece.color === byColor && attackers.includes(piece.type)) return true;
          break;
        }
        row += rowOffset;
        col += colOffset;
      }
    }
  }

  return false;
}

export function isInCheck(board: Board, color: PieceColor): boolean {
  const king = findKing(board, color);
  return king ? isSquareAttacked(board, king, oppositeColor(color)) : true;
}

function pseudoMoves(state: GameState, from: Square): ChessMove[] {
  const piece = state.board[from.row]?.[from.col];
  if (!piece) return [];

  const moves: ChessMove[] = [];
  const addTarget = (row: number, col: number) => {
    const target = { row, col };
    if (!isInside(target)) return false;
    const occupant = state.board[row][col];
    if (occupant?.color === piece.color) return false;

    const promotion =
      piece.type === "pawn" && (row === 0 || row === 7) ? "queen" : undefined;
    moves.push({ from, to: target, ...(promotion ? { promotion } : {}) });
    return !occupant;
  };

  if (piece.type === "pawn") {
    const direction = piece.color === "white" ? -1 : 1;
    const startRow = piece.color === "white" ? 6 : 1;
    const oneStep = { row: from.row + direction, col: from.col };

    if (isInside(oneStep) && !state.board[oneStep.row][oneStep.col]) {
      addTarget(oneStep.row, oneStep.col);
      const twoStep = { row: from.row + direction * 2, col: from.col };
      if (from.row === startRow && !state.board[twoStep.row][twoStep.col]) {
        addTarget(twoStep.row, twoStep.col);
      }
    }

    for (const colOffset of [-1, 1]) {
      const target = { row: from.row + direction, col: from.col + colOffset };
      if (!isInside(target)) continue;
      const occupant = state.board[target.row][target.col];
      if (occupant && occupant.color !== piece.color) {
        addTarget(target.row, target.col);
      } else if (
        state.enPassant?.row === target.row &&
        state.enPassant.col === target.col
      ) {
        moves.push({ from, to: target });
      }
    }
    return moves;
  }

  if (piece.type === "knight" || piece.type === "king") {
    const offsets = piece.type === "knight" ? KNIGHT_STEPS : KING_STEPS;
    for (const [rowOffset, colOffset] of offsets) {
      addTarget(from.row + rowOffset, from.col + colOffset);
    }

    if (piece.type === "king") {
      const homeRow = piece.color === "white" ? 7 : 0;
      const rights = state.castlingRights[piece.color];
      const enemy = oppositeColor(piece.color);
      if (
        from.row === homeRow &&
        from.col === 4 &&
        !isSquareAttacked(state.board, from, enemy)
      ) {
        if (
          rights.kingSide &&
          state.board[homeRow][5] === null &&
          state.board[homeRow][6] === null &&
          state.board[homeRow][7]?.type === "rook" &&
          state.board[homeRow][7]?.color === piece.color &&
          !isSquareAttacked(state.board, { row: homeRow, col: 5 }, enemy) &&
          !isSquareAttacked(state.board, { row: homeRow, col: 6 }, enemy)
        ) {
          moves.push({ from, to: { row: homeRow, col: 6 } });
        }
        if (
          rights.queenSide &&
          state.board[homeRow][1] === null &&
          state.board[homeRow][2] === null &&
          state.board[homeRow][3] === null &&
          state.board[homeRow][0]?.type === "rook" &&
          state.board[homeRow][0]?.color === piece.color &&
          !isSquareAttacked(state.board, { row: homeRow, col: 3 }, enemy) &&
          !isSquareAttacked(state.board, { row: homeRow, col: 2 }, enemy)
        ) {
          moves.push({ from, to: { row: homeRow, col: 2 } });
        }
      }
    }
    return moves;
  }

  const directions =
    piece.type === "bishop"
      ? BISHOP_DIRECTIONS
      : piece.type === "rook"
        ? ROOK_DIRECTIONS
        : [...BISHOP_DIRECTIONS, ...ROOK_DIRECTIONS];

  for (const [rowOffset, colOffset] of directions) {
    let row = from.row + rowOffset;
    let col = from.col + colOffset;
    while (addTarget(row, col)) {
      row += rowOffset;
      col += colOffset;
    }
  }

  return moves;
}

export function applyMove(state: GameState, move: ChessMove): GameState {
  const board = state.board.map((row) => row.slice());
  const piece = board[move.from.row][move.from.col];
  if (!piece) return state;

  const captured =
    piece.type === "pawn" &&
    state.enPassant?.row === move.to.row &&
    state.enPassant.col === move.to.col &&
    move.from.col !== move.to.col;

  board[move.from.row][move.from.col] = null;
  if (captured) board[move.from.row][move.to.col] = null;
  board[move.to.row][move.to.col] = {
    type: move.promotion ?? piece.type,
    color: piece.color,
  };

  if (piece.type === "king" && Math.abs(move.to.col - move.from.col) === 2) {
    const rookFromCol = move.to.col > move.from.col ? 7 : 0;
    const rookToCol = move.to.col > move.from.col ? 5 : 3;
    board[move.from.row][rookToCol] = board[move.from.row][rookFromCol];
    board[move.from.row][rookFromCol] = null;
  }

  const castlingRights = {
    white: { ...state.castlingRights.white },
    black: { ...state.castlingRights.black },
  };
  if (piece.type === "king") {
    castlingRights[piece.color] = { kingSide: false, queenSide: false };
  }

  const revokeRookRight = (color: PieceColor, square: Square) => {
    const homeRow = color === "white" ? 7 : 0;
    if (square.row !== homeRow) return;
    if (square.col === 0) castlingRights[color].queenSide = false;
    if (square.col === 7) castlingRights[color].kingSide = false;
  };

  if (piece.type === "rook") revokeRookRight(piece.color, move.from);
  const targetPiece = state.board[move.to.row][move.to.col];
  if (targetPiece?.type === "rook") revokeRookRight(targetPiece.color, move.to);

  const isDoublePawnMove =
    piece.type === "pawn" && Math.abs(move.to.row - move.from.row) === 2;

  return {
    board,
    turn: oppositeColor(state.turn),
    castlingRights,
    enPassant: isDoublePawnMove
      ? { row: (move.from.row + move.to.row) / 2, col: move.from.col }
      : null,
    halfmoveClock: piece.type === "pawn" || targetPiece || captured ? 0 : state.halfmoveClock + 1,
    fullmoveNumber: state.fullmoveNumber + (state.turn === "black" ? 1 : 0),
  };
}

export function getLegalMoves(
  state: GameState,
  color: PieceColor = state.turn,
): ChessMove[] {
  const legalMoves: ChessMove[] = [];

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (!piece || piece.color !== color) continue;

      for (const move of pseudoMoves(state, { row, col })) {
        const nextState = applyMove(state, move);
        if (!isInCheck(nextState.board, color)) legalMoves.push(move);
      }
    }
  }

  return legalMoves;
}

export function makeMove(state: GameState, move: ChessMove): GameState | null {
  const legalMove = getLegalMoves(state).find(
    (candidate) =>
      candidate.from.row === move.from.row &&
      candidate.from.col === move.from.col &&
      candidate.to.row === move.to.row &&
      candidate.to.col === move.to.col,
  );
  return legalMove ? applyMove(state, { ...legalMove, promotion: move.promotion ?? legalMove.promotion }) : null;
}

export function gameOutcome(
  state: GameState,
): "checkmate" | "stalemate" | "draw" | null {
  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) return isInCheck(state.board, state.turn) ? "checkmate" : "stalemate";
  if (state.halfmoveClock >= 100) return "draw";
  return null;
}

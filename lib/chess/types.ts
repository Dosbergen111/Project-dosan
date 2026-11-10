export type PieceColor = "white" | "black";
export type PieceType = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";

export type Piece = {
  type: PieceType;
  color: PieceColor;
};

export type Square = {
  row: number;
  col: number;
};

export type ChessMove = {
  from: Square;
  to: Square;
  promotion?: Exclude<PieceType, "king" | "pawn">;
};

export type Board = (Piece | null)[][];

export type CastlingRights = Record<
  PieceColor,
  { kingSide: boolean; queenSide: boolean }
>;

export type GameState = {
  board: Board;
  turn: PieceColor;
  castlingRights: CastlingRights;
  enPassant: Square | null;
  halfmoveClock: number;
  fullmoveNumber: number;
};

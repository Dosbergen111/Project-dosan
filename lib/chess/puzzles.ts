export type DailyPuzzle = {
  id: string;
  fen: string;
  move: string;
  comment: string;
};

export const DAILY_PUZZLES: DailyPuzzle[] = [
  {
    id: "back-rank-mate",
    fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    move: "d1d8",
    comment: "Ладья проходит по открытой линии и ставит мат по последнему ряду.",
  },
  {
    id: "queen-capture-rook",
    fen: "6k1/8/8/8/8/8/6q1/6RK w - - 0 1",
    move: "g1g2",
    comment: "Король под шахом: ладья может немедленно забрать ферзя.",
  },
  {
    id: "bishop-wins-queen",
    fen: "6k1/8/8/8/8/8/3q4/2B3K1 w - - 0 1",
    move: "c1d2",
    comment: "Слон берёт ферзя на соседней диагонали.",
  },
  {
    id: "knight-fork",
    fen: "4k3/7q/8/8/4N3/8/8/6K1 w - - 0 1",
    move: "e4f6",
    comment: "Конь с шахом нападает на ферзя: после ухода короля ферзь будет потерян.",
  },
  {
    id: "scholars-mate",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4",
    move: "h5f7",
    comment: "Ферзь берёт пешку f7 при поддержке слона — мат королю.",
  },
];

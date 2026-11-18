import { chooseBotMove } from "@/lib/chess/engine";
import { levelByDifficulty } from "@/lib/chess/levels";
import { getLegalMoves } from "@/lib/chess/rules";
import { stateToFen } from "@/lib/chess/board";
import type { GameState, PieceColor } from "@/lib/chess/types";
import type { ChessMove } from "@/lib/chess/types";

type BotRequest = {
  state: GameState;
  difficulty: number;
  botColor: PieceColor;
};

const workerScope = self as unknown as {
  addEventListener: typeof self.addEventListener;
  postMessage: (message: ReturnType<typeof chooseBotMove>) => void;
};

type StockfishEngine = {
  postMessage: (command: string) => void;
  addMessageListener?: (listener: (message: string) => void) => void;
  onmessage?: (event: MessageEvent<string>) => void;
};

declare function importScripts(...urls: string[]): void;

const STOCKFISH_CDN_SCRIPTS = [
  "https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish-nnue-16.js",
  "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js",
] as const;

function squareFromName(name: string): { row: number; col: number } | null {
  const match = /^([a-h])([1-8])$/.exec(name);
  if (!match) return null;
  return { row: 8 - Number(match[2]), col: match[1].charCodeAt(0) - 97 };
}

function moveFromBestMove(state: GameState, bestMove: string): ChessMove | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)) return null;
  const from = squareFromName(bestMove.slice(0, 2));
  const to = squareFromName(bestMove.slice(2, 4));
  if (!from || !to) return null;
  const promotion = bestMove[4] as "q" | "r" | "b" | "n" | undefined;
  const promotionTypes = { q: "queen", r: "rook", b: "bishop", n: "knight" } as const;
  return getLegalMoves(state).find((move) =>
    move.from.row === from.row &&
    move.from.col === from.col &&
    move.to.row === to.row &&
    move.to.col === to.col &&
    (!promotion || move.promotion === promotionTypes[promotion]),
  ) ?? null;
}

function createStockfishEngine(): StockfishEngine | null {
  for (const script of STOCKFISH_CDN_SCRIPTS) {
    try {
      importScripts(script);
      const scope = self as unknown as {
        STOCKFISH?: () => StockfishEngine;
        Stockfish?: () => StockfishEngine;
        stockfish?: (() => StockfishEngine) | StockfishEngine;
      };
      if (scope.STOCKFISH) return scope.STOCKFISH();
      if (scope.Stockfish) return scope.Stockfish();
      if (typeof scope.stockfish === "function") return scope.stockfish();
      if (scope.stockfish && typeof scope.stockfish.postMessage === "function") return scope.stockfish;
    } catch {
      continue;
    }
  }
  return null;
}

workerScope.addEventListener("message", (event: Event) => {
  const { state, difficulty, botColor } = (event as MessageEvent<BotRequest>).data;
  const level = levelByDifficulty(difficulty);

  let finished = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const fallback = () => {
    if (finished) return;
    finished = true;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    workerScope.postMessage(chooseBotMove(state, difficulty, botColor));
  };

  let engine: StockfishEngine | null = null;
  try {
    engine = createStockfishEngine();
  } catch {
    fallback();
    return;
  }
  if (!engine) {
    fallback();
    return;
  }

  const listener = (message: string) => {
    const match = /^bestmove\s+(\S+)/.exec(message.trim());
    if (!match || finished) return;
    finished = true;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    const move = moveFromBestMove(state, match[1]);
    workerScope.postMessage(move ?? chooseBotMove(state, difficulty, botColor));
  };

  if (engine.addMessageListener) engine.addMessageListener(listener);
  else engine.onmessage = (messageEvent) => listener(messageEvent.data);

  timeoutId = setTimeout(fallback, 30_000);
  engine.postMessage("uci");
  engine.postMessage(`setoption name Skill Level value ${level.skill}`);
  engine.postMessage(`position fen ${stateToFen(state)}`);
  engine.postMessage(`go depth ${level.depth}`);
});

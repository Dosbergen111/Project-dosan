import { chooseBotMove } from "@/lib/chess/moves";
import type { GameState, PieceColor } from "@/lib/chess/types";

type BotRequest = {
  state: GameState;
  difficulty: number;
  botColor: PieceColor;
};

const workerScope = self as unknown as {
  addEventListener: typeof self.addEventListener;
  postMessage: (message: ReturnType<typeof chooseBotMove>) => void;
};

workerScope.addEventListener("message", (event: Event) => {
  const { state, difficulty, botColor } = (event as MessageEvent<BotRequest>).data;
  workerScope.postMessage(chooseBotMove(state, difficulty, botColor));
});

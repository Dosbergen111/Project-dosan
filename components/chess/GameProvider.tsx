"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/AuthProvider";
import { createInitialState, stateFromFen, stateToFen } from "@/lib/chess/board";
import { moveToUci } from "@/lib/chess/moves";
import { gameOutcome, getLegalMoves, isInCheck, makeMove } from "@/lib/chess/rules";
import type { ChessMove, GameMode, GameResult, GameState, PartySnapshot, PieceColor } from "@/lib/chess/types";

type GameContextValue = {
  game: GameState;
  past: PartySnapshot[];
  moves: string[];
  selection: { row: number; col: number } | null;
  gameMode: GameMode;
  playerColor: PieceColor;
  difficulty: number;
  activeDifficulty: number;
  partyStarted: boolean;
  boardSize: "small" | "medium" | "large";
  gameResult: GameResult | null;
  whiteTime: number;
  blackTime: number;
  selectedTime: number;
  autoSaveState: string;
  hintsUsed: number;
  hintMessage: string;
  boardStyle: string;
  coordinatesShown: boolean;
  materialShown: boolean;
  lightTheme: boolean;
  legalMoves: ChessMove[];
  outcome: ReturnType<typeof gameOutcome>;
  check: boolean;
  botTurn: boolean;
  botThinking: boolean;
  partyInProgress: boolean;
  setBoardSize: (size: "small" | "medium" | "large") => void;
  setHintsUsed: Dispatch<SetStateAction<number>>;
  setHintMessage: (message: string) => void;
  setSelection: (selection: { row: number; col: number } | null) => void;
  setGameResult: (result: GameResult | null) => void;
  setBoardStyle: (style: string) => void;
  setCoordinatesShown: (shown: boolean) => void;
  setMaterialShown: (shown: boolean) => void;
  setLightTheme: (light: boolean) => void;
  handleSquareClick: (row: number, col: number) => void;
  startNewGame: () => void;
  resetLocalGame: (ownerId?: number | null) => void;
  undoMove: () => void;
  changeDifficulty: (level: number) => void;
  changeGameMode: (mode: GameMode) => void;
  changePlayerColor: (color: PieceColor) => void;
  setTime: (seconds: number) => void;
  loadFenPosition: (fen: string) => boolean;
};

const GameContext = createContext<GameContextValue | null>(null);

function resultFromOutcome(outcome: ReturnType<typeof gameOutcome>, state: GameState, playerColor: PieceColor): GameResult | null {
  if (!outcome) return null;
  if (outcome !== "checkmate") return "draw";
  return state.turn === playerColor ? "loss" : "win";
}

export function GameProvider({ children }: { children: ReactNode }) {
  const { account, setAccount } = useAuth();
  const [game, setGame] = useState<GameState>(() => createInitialState());
  const [past, setPast] = useState<PartySnapshot[]>([]);
  const [moves, setMoves] = useState<string[]>([]);
  const [selection, setSelection] = useState<{ row: number; col: number } | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>("pvc");
  const [playerColor, setPlayerColor] = useState<PieceColor>("white");
  const [difficulty, setDifficulty] = useState(1);
  const [activeDifficulty, setActiveDifficulty] = useState(1);
  const [partyStarted, setPartyStarted] = useState(false);
  const [gameOwnerId, setGameOwnerId] = useState<number | null>(null);
  const [boardSize, setBoardSize] = useState<"small" | "medium" | "large">("medium");
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [gameNumber, setGameNumber] = useState(0);
  const [selectedTime, setSelectedTime] = useState(600);
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const selectedTimeRef = useRef(600);
  const whiteTimeRef = useRef(600);
  const blackTimeRef = useRef(600);
  const [autoSaveState, setAutoSaveState] = useState("");
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintMessage, setHintMessage] = useState("");
  const [botThinking, setBotThinking] = useState(false);
  const [boardStyle, setBoardStyle] = useState("default");
  const [coordinatesShown, setCoordinatesShown] = useState(true);
  const [materialShown, setMaterialShown] = useState(true);
  const [lightTheme, setLightTheme] = useState(false);
  const savedGames = useRef(new Set<string>());

  useEffect(() => {
    document.body.classList.toggle("light-theme", lightTheme);
  }, [lightTheme]);

  const legalMoves = getLegalMoves(game);
  const outcome = gameOutcome(game);
  const check = isInCheck(game.board, game.turn);
  const isHumanTurn = gameMode === "pvp" || game.turn === playerColor;
  const botTurn = partyStarted && !gameResult && gameMode === "pvc" && !isHumanTurn && !outcome;
  const partyInProgress = partyStarted && !gameResult;

  const resetLocalGame = useCallback((ownerId: number | null = account?.id ?? null) => {
    setGame(createInitialState());
    setPast([]);
    setMoves([]);
    setSelection(null);
    setGameResult(null);
    setPartyStarted(false);
    setGameOwnerId(ownerId);
    setActiveDifficulty(difficulty);
    setAutoSaveState("");
    whiteTimeRef.current = selectedTimeRef.current;
    blackTimeRef.current = selectedTimeRef.current;
    setWhiteTime(selectedTimeRef.current);
    setBlackTime(selectedTimeRef.current);
    setGameNumber((number) => number + 1);
  }, [account?.id, difficulty]);

  function startNewGame() {
    resetLocalGame(account?.id ?? null);
    setPartyStarted(true);
    setHintsUsed(0);
    setHintMessage("");
  }

  function handleSquareClick(row: number, col: number) {
    if (gameResult || botTurn || !isHumanTurn) return;
    const piece = game.board[row][col];
    if (selection) {
      const move = legalMoves.find((candidate) =>
        candidate.from.row === selection.row && candidate.from.col === selection.col
        && candidate.to.row === row && candidate.to.col === col,
      );
      if (move) {
        const next = makeMove(game, move);
        if (next) {
          if (!partyStarted) {
            setPartyStarted(true);
            setGameOwnerId(account?.id ?? null);
            setActiveDifficulty(difficulty);
          }
          setPast((previous) => [...previous, { game, moves }]);
          setMoves((previous) => [...previous, moveToUci(move)]);
          setGame(next);
          const result = resultFromOutcome(gameOutcome(next), next, playerColor);
          if (result) setGameResult(result);
        }
        setSelection(null);
      } else if (piece?.color === game.turn) {
        setSelection({ row, col });
      } else {
        setSelection(null);
      }
      return;
    }
    if (piece?.color === game.turn) setSelection({ row, col });
  }

  function undoMove() {
    if (botTurn || !past.length || gameResult) return;
    const plies = gameMode === "pvc" ? Math.min(2, past.length) : 1;
    const snapshot = past[past.length - plies];
    setGame(snapshot.game);
    setMoves(snapshot.moves);
    setPast((previous) => previous.slice(0, -plies));
    setSelection(null);
  }

  function changeDifficulty(level: number) {
    if (partyInProgress || (level === 20 && account?.is_premium !== true)) return;
    setDifficulty(level);
    setActiveDifficulty(level);
  }

  function changeGameMode(mode: GameMode) {
    if (partyInProgress) return;
    setGameMode(mode);
    if (mode === "pvp") setPlayerColor("white");
  }

  function changePlayerColor(color: PieceColor) {
    if (partyInProgress) return;
    setPlayerColor(color);
  }

  function setTime(seconds: number) {
    setSelectedTime(seconds);
    selectedTimeRef.current = seconds;
    whiteTimeRef.current = seconds;
    blackTimeRef.current = seconds;
    setWhiteTime(seconds);
    setBlackTime(seconds);
  }

  function loadFenPosition(fen: string): boolean {
    const loaded = stateFromFen(fen);
    if (!loaded || !loaded.board.some((rank) => rank.some((piece) => piece?.type === "king" && piece.color === "white"))
      || !loaded.board.some((rank) => rank.some((piece) => piece?.type === "king" && piece.color === "black"))) {
      return false;
    }
    setGame(loaded);
    setPast([]);
    setMoves([]);
    setSelection(null);
    setGameResult(null);
    setPartyStarted(false);
    setGameOwnerId(account?.id ?? null);
    setActiveDifficulty(difficulty);
    setGameNumber((number) => number + 1);
    setTime(selectedTime);
    return true;
  }

  useEffect(() => {
    if (!botTurn) return;
    setBotThinking(true);
    const worker = new Worker(new URL("../../lib/chess/bot.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<ChessMove | null>) => {
      setBotThinking(false);
      const move = event.data;
      if (!move) return;
      const next = makeMove(game, move);
      if (!next) return;
      setPast((previous) => [...previous, { game, moves }]);
      setMoves((previous) => [...previous, moveToUci(move)]);
      setGame(next);
      const result = resultFromOutcome(gameOutcome(next), next, playerColor);
      if (result) setGameResult(result);
    };
    worker.onerror = () => setBotThinking(false);
    worker.postMessage({ state: game, difficulty: activeDifficulty, botColor: game.turn });
    return () => worker.terminate();
  }, [activeDifficulty, botTurn, game, moves, playerColor]);

  useEffect(() => {
    if (!partyStarted || gameResult || moves.length === 0) return;
    const timer = window.setInterval(() => {
      if (game.turn === "white") {
        const remaining = Math.max(0, whiteTimeRef.current - 1);
        whiteTimeRef.current = remaining;
        setWhiteTime(remaining);
        if (remaining === 0) setGameResult(game.turn === playerColor ? "loss" : "win");
      } else {
        const remaining = Math.max(0, blackTimeRef.current - 1);
        blackTimeRef.current = remaining;
        setBlackTime(remaining);
        if (remaining === 0) setGameResult(game.turn === playerColor ? "loss" : "win");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [game.turn, gameMode, gameResult, moves.length, partyStarted, playerColor]);

  useEffect(() => {
    if (!gameResult || !partyStarted || !account || gameOwnerId !== account.id) return;
    const key = `${account.id}:${gameNumber}`;
    if (savedGames.current.has(key)) return;
    savedGames.current.add(key);
    setAutoSaveState("Сохраняем партию и обновляем Elo…");
    void fetch("/api/save-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: gameResult, fen: stateToFen(game), moves: moves.join(" "), gameMode, difficulty: activeDifficulty }),
    })
      .then(async (response) => {
        const data = await response.json() as { elo?: number; eloChange?: number; league?: string; error?: string };
        if (!response.ok) throw new Error(data.error ?? `Ошибка запроса (${response.status}).`);
        if (typeof data.elo === "number") {
          setAccount((previous) => previous ? { ...previous, elo: data.elo!, league: data.league ?? previous.league } : previous);
        }
        setAutoSaveState(`Партия сохранена. Изменение Elo: ${data.eloChange && data.eloChange > 0 ? "+" : ""}${data.eloChange ?? 0}`);
      })
      .catch((error: unknown) => setAutoSaveState(error instanceof Error ? error.message : "Не удалось сохранить партию."));
  }, [account, activeDifficulty, game, gameMode, gameNumber, gameOwnerId, gameResult, moves, partyStarted, setAccount]);

  const value: GameContextValue = {
    game, past, moves, selection, gameMode, playerColor, difficulty, activeDifficulty, partyStarted,
    boardSize, gameResult, whiteTime, blackTime, selectedTime, autoSaveState, hintsUsed, hintMessage,
    boardStyle, coordinatesShown, materialShown, lightTheme,
    legalMoves, outcome, check, botTurn, botThinking, partyInProgress,
    setBoardSize, setHintsUsed,     setHintMessage, setSelection, setGameResult, handleSquareClick, startNewGame, resetLocalGame,
    undoMove, changeDifficulty, changeGameMode, changePlayerColor, setTime, loadFenPosition,
    setBoardStyle, setCoordinatesShown, setMaterialShown, setLightTheme,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) throw new Error("useGame must be used within GameProvider.");
  return context;
}

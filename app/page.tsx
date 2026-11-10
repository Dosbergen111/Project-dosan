"use client";

import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import ChatPanel from "@/components/ChatPanel";
import { useAuth, type Account } from "@/components/AuthProvider";
import ChessBoard from "@/components/ChessBoard";
import OnlinePanel from "@/components/OnlinePanel";
import PuzzlePanel from "@/components/PuzzlePanel";
import ProfileSummary from "@/components/ProfileSummary";
import { createInitialState, stateFromFen, stateToFen } from "@/lib/chess/board";
import { moveToUci } from "@/lib/chess/moves";
import { gameOutcome, getLegalMoves, isInCheck, makeMove } from "@/lib/chess/rules";
import type { ChessMove, GameState, Piece, PieceColor } from "@/lib/chess/types";

type HistoryReplay = {
  states: GameState[];
  moves: string[];
  currentIndex: number;
  gameId: number;
};

type ApiError = { error?: string };
type TabId =
  | "landing"
  | "game"
  | "rules"
  | "chat"
  | "leaderboard"
  | "history"
  | "analyze"
  | "puzzles"
  | "online"
  | "settings"
  | "about";
type GameResult = "win" | "loss" | "draw";
type HistoryEntry = {
  id: number;
  result: string;
  fen: string;
  moves: string;
  createdAt: string;
};
type LeaderEntry = {
  username: string;
  elo: number;
  league: string;
  rank: number;
};

const TABS: { id: Exclude<TabId, "landing">; label: string }[] = [
  { id: "game", label: "🎮 Игра" },
  { id: "rules", label: "📖 Правила" },
  { id: "chat", label: "💬 Чат" },
  { id: "leaderboard", label: "🏆 Лидеры" },
  { id: "history", label: "📊 История" },
  { id: "analyze", label: "🔍 Анализ" },
  { id: "puzzles", label: "🧩 Задачи" },
  { id: "online", label: "🌐 Онлайн" },
  { id: "settings", label: "⚙️ Настройки" },
  { id: "about", label: "ℹ️ О программе" },
];

function getErrorMessage(data: ApiError, status: number): string {
  return data.error ?? `Ошибка запроса (${status}).`;
}

function resultFromOutcome(
  outcome: ReturnType<typeof gameOutcome>,
  state: GameState,
  playerColor: PieceColor,
): GameResult | null {
  if (!outcome) return null;
  if (outcome !== "checkmate") return "draw";
  return state.turn === playerColor ? "loss" : "win";
}

function getPreferredTheme(): boolean {
  const storedTheme = localStorage.getItem("preferredTheme") ?? localStorage.getItem("chessTheme");
  return storedTheme === "light";
}

function subscribePreferredTheme(onChange: () => void): () => void {
  const listener = () => onChange();
  window.addEventListener("storage", listener);
  window.addEventListener("preferred-theme-change", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("preferred-theme-change", listener);
  };
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => createInitialState());
  const [past, setPast] = useState<{ game: GameState; moves: string[] }[]>([]);
  const [moves, setMoves] = useState<string[]>([]);
  const [selection, setSelection] = useState<{ row: number; col: number } | null>(null);
  const { account, setAccount, clearAccount } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("landing");
  const [gameMode, setGameMode] = useState<"pvp" | "pvc">("pvc");
  const [playerColor, setPlayerColor] = useState<PieceColor>("white");
  const [difficulty, setDifficulty] = useState(1);
  const [activeDifficulty, setActiveDifficulty] = useState(1);
  const [partyStarted, setPartyStarted] = useState(false);
  const [gameOwnerId, setGameOwnerId] = useState<number | null>(null);
  const [boardSize, setBoardSize] = useState<"small" | "medium" | "large">("medium");
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [gameNumber, setGameNumber] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [panelMessage, setPanelMessage] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyReplay, setHistoryReplay] = useState<HistoryReplay | null>(null);
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);
  const [boardStyle, setBoardStyle] = useState("default");
  const lightTheme = useSyncExternalStore(subscribePreferredTheme, getPreferredTheme, () => false);
  const [coordinatesShown, setCoordinatesShown] = useState(true);
  const [materialShown, setMaterialShown] = useState(true);
  const [fenInput, setFenInput] = useState("");
  const [selectedTime, setSelectedTime] = useState(600);
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const selectedTimeRef = useRef(600);
  const whiteTimeRef = useRef(600);
  const blackTimeRef = useRef(600);
  const [autoSaveState, setAutoSaveState] = useState("");
  const [analysisStep, setAnalysisStep] = useState(0);
  const savedGames = useRef(new Set<string>());

  const legalMoves = getLegalMoves(game);
  const outcome = gameOutcome(game);
  const check = isInCheck(game.board, game.turn);
  const isHumanTurn = gameMode === "pvp" || game.turn === playerColor;
  const botTurn = partyStarted && !gameResult && gameMode === "pvc" && !isHumanTurn && !outcome;
  const partyInProgress = partyStarted && !gameResult;
  const statusText = outcome
    ? outcome === "checkmate"
      ? game.turn === playerColor
        ? "Мат — вы проиграли!"
        : "Мат — вы победили!"
      : "Ничья."
    : `${check ? "Шах! " : ""}Ход ${game.turn === "white" ? "белых" : "чёрных"}${botTurn ? " — компьютер думает…" : ""}`;
  const movePairs = Array.from({ length: Math.ceil(moves.length / 2) }, (_, index) => ({
    number: index + 1,
    white: moves[index * 2],
    black: moves[index * 2 + 1],
  }));
  const analysisStates = [...past.map((snapshot) => snapshot.game), game];
  const analysisIndex = Math.min(analysisStep, analysisStates.length - 1);
  const analysisGame = analysisStates[analysisIndex] ?? game;
  const historyReplayGame = historyReplay?.states[historyReplay.currentIndex] ?? null;
  const gameActive = activeTab === "game";

  useEffect(() => {
    document.body.classList.toggle("light-theme", lightTheme);
  }, [lightTheme]);

  function changeTheme(isLightTheme: boolean) {
    localStorage.setItem("preferredTheme", isLightTheme ? "light" : "dark");
    window.dispatchEvent(new Event("preferred-theme-change"));
  }

  useEffect(() => {
    if (!botTurn) return;
    const worker = new Worker(new URL("../lib/chess/bot.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<ChessMove | null>) => {
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
    worker.onerror = (event) => {
      console.error("Chess bot worker failed:", event.message);
      setPanelMessage("Не удалось рассчитать ход компьютера.");
    };
    worker.postMessage({ state: game, difficulty: activeDifficulty, botColor: game.turn });

    return () => worker.terminate();
  }, [activeDifficulty, botTurn, game, moves, playerColor]);

  useEffect(() => {
    if (!gameActive || gameResult || moves.length === 0) return;

    const timer = window.setInterval(() => {
      if (game.turn === "white") {
        const remaining = Math.max(0, whiteTimeRef.current - 1);
        whiteTimeRef.current = remaining;
        setWhiteTime(remaining);
        if (remaining === 0) {
          setGameResult(game.turn === playerColor ? "loss" : "win");
        }
      } else {
        const remaining = Math.max(0, blackTimeRef.current - 1);
        blackTimeRef.current = remaining;
        setBlackTime(remaining);
        if (remaining === 0) setGameResult(game.turn === playerColor ? "loss" : "win");
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [game.turn, gameActive, gameMode, gameResult, moves.length, playerColor]);

  useEffect(() => {
    if (!gameResult || !partyStarted || !account || gameOwnerId !== account.id) return;
    const key = `${account.id}:${gameNumber}`;
    if (savedGames.current.has(key)) return;
    savedGames.current.add(key);
    setAutoSaveState("Сохраняем партию и обновляем Elo…");

    void fetch("/api/save-game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${account.sessionToken}`,
      },
      body: JSON.stringify({
        result: gameResult,
        fen: stateToFen(game),
        moves: moves.join(" "),
        gameMode,
        difficulty: activeDifficulty,
      }),
    })
      .then(async (response) => {
        const data = (await response.json()) as ApiError & {
          elo?: number;
          eloChange?: number;
          league?: string;
        };
        if (!response.ok) throw new Error(getErrorMessage(data, response.status));
        const updatedElo = data.elo;
        if (typeof updatedElo === "number") {
          setAccount((previous) =>
            previous
              ? { ...previous, elo: updatedElo, league: data.league ?? previous.league }
              : previous,
          );
        }
        setAutoSaveState(
          `Партия сохранена. Изменение Elo: ${data.eloChange && data.eloChange > 0 ? "+" : ""}${data.eloChange ?? 0}`,
        );
        setLeaderboardRefresh((count) => count + 1);
      })
      .catch((error: unknown) => {
        console.error("Could not save game:", error);
        setAutoSaveState(error instanceof Error ? error.message : "Не удалось сохранить партию.");
      });
  }, [account, activeDifficulty, game, gameMode, gameNumber, gameOwnerId, gameResult, moves, partyStarted, setAccount]);

  useEffect(() => {
    if (activeTab === "leaderboard") {
      void fetch(`/api/leaderboard${account ? `?userId=${account.id}` : ""}`)
        .then(async (response) => {
          const data = (await response.json()) as ApiError & {
            leaderboard?: LeaderEntry[];
            userRank?: { rank: number; username: string; elo: number; league: string } | null;
          };
          if (!response.ok) throw new Error(getErrorMessage(data, response.status));
          setLeaderboard(data.leaderboard ?? []);
          if (data.userRank) {
            setPanelMessage(
              `Ваше место: #${data.userRank.rank} · ${data.userRank.elo} Elo · ${data.userRank.league}`,
            );
          }
        })
        .catch((error: unknown) => {
          console.error("Could not load leaderboard:", error);
          setPanelMessage(error instanceof Error ? error.message : "Ошибка загрузки лидеров.");
        });
    } else if (activeTab === "history" && account) {
      void fetch("/api/history", {
        headers: { Authorization: `Bearer ${account.sessionToken}` },
      })
        .then(async (response) => {
          const data = (await response.json()) as ApiError & { games?: HistoryEntry[] };
          if (!response.ok) throw new Error(getErrorMessage(data, response.status));
          setHistory(data.games ?? []);
        })
        .catch((error: unknown) => {
          console.error("Could not load game history:", error);
          setPanelMessage(error instanceof Error ? error.message : "Ошибка загрузки истории.");
        });
    }
  }, [activeTab, account, leaderboardRefresh]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json()) as Account & ApiError;
      if (!response.ok) throw new Error(getErrorMessage(data, response.status));

      if (authMode === "register") {
        resetLocalGame(null);
        setAuthMode("login");
        setPassword("");
        setMessage("Регистрация прошла успешно. Теперь войдите.");
      } else {
        sessionStorage.setItem("sessionToken", data.sessionToken);
        localStorage.setItem("userId", String(data.id));
        setAccount(data);
        resetLocalGame(data.id);
        setPassword("");
        setAuthOpen(false);
        setMessage("");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить запрос.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (!account) return;
    setBusy(true);
    try {
      const response = await fetch("/api/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${account.sessionToken}` },
      });
      const data = (await response.json()) as ApiError;
      if (!response.ok) throw new Error(getErrorMessage(data, response.status));
      clearAccount();
      setActiveTab("landing");
      setMessage("Вы вышли из аккаунта.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выйти из аккаунта.");
    } finally {
      setBusy(false);
    }
  }

  function handleSquareClick(row: number, col: number) {
    if (gameResult || botTurn || !isHumanTurn) return;
    const piece = game.board[row][col];
    if (selection) {
      const move = legalMoves.find(
        (candidate) =>
          candidate.from.row === selection.row &&
          candidate.from.col === selection.col &&
          candidate.to.row === row &&
          candidate.to.col === col,
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

  function resetLocalGame(ownerId: number | null) {
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
  }

  function startNewGame() {
    resetLocalGame(account?.id ?? null);
    setPartyStarted(true);
  }

  function changeDifficulty(level: number) {
    if (partyInProgress || (level === 20 && account?.is_premium !== true)) return;
    setDifficulty(level);
    setActiveDifficulty(level);
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

  function replayHistory(entry: HistoryEntry) {
    const states = [createInitialState()];
    const replayMoves: string[] = [];
    let position = states[0];
    for (const token of entry.moves.split(/[\s,]+/).filter(Boolean)) {
      const match = token.match(/^([a-h][1-8])-?([a-h][1-8])([qrbn])?$/i);
      if (!match) continue;
      const square = (name: string) => ({
        row: 8 - Number(name[1]),
        col: name.charCodeAt(0) - 97,
      });
      const from = square(match[1].toLowerCase());
      const to = square(match[2].toLowerCase());
      const legalMove = getLegalMoves(position).find(
        (candidate) =>
          candidate.from.row === from.row && candidate.from.col === from.col &&
          candidate.to.row === to.row && candidate.to.col === to.col,
      );
      if (!legalMove) break;
      const next = makeMove(position, {
        ...legalMove,
        ...(match[3]
          ? {
              promotion: ({
                q: "queen",
                r: "rook",
                b: "bishop",
                n: "knight",
              } as const)[match[3].toLowerCase() as "q" | "r" | "b" | "n"],
            }
          : {}),
      });
      if (!next) break;
      position = next;
      replayMoves.push(token);
      states.push(position);
    }
    setHistoryReplay({
      states,
      moves: replayMoves,
      currentIndex: states.length - 1,
      gameId: entry.id,
    });
  }

  function startGame() {
    setActiveTab("game");
    if (gameResult) startNewGame();
  }

  function closeAuth() {
    setAuthOpen(false);
    setMessage("");
  }

  function toggleAuthMode() {
    setAuthMode((mode) => (mode === "login" ? "register" : "login"));
    setMessage("");
  }

  function exportMoves() {
    const content = `1. ${moves.join(" ")}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "chess-game.pgn";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function loadFenPosition() {
    const loaded = stateFromFen(fenInput);
    if (!loaded || !loaded.board.some((rank) => rank.some((piece) => piece?.type === "king" && piece.color === "white")) ||
      !loaded.board.some((rank) => rank.some((piece) => piece?.type === "king" && piece.color === "black"))) {
      setPanelMessage("Некорректная FEN-позиция.");
      return;
    }
    setPanelMessage("");
    setGame(loaded);
    setPast([]);
    setMoves([]);
    setSelection(null);
    setGameResult(null);
    setPartyStarted(false);
    setGameOwnerId(account?.id ?? null);
    setActiveDifficulty(difficulty);
    setGameNumber((number) => number + 1);
    whiteTimeRef.current = selectedTime;
    blackTimeRef.current = selectedTime;
    setWhiteTime(selectedTime);
    setBlackTime(selectedTime);
  }

  async function copyFen() {
    try {
      await navigator.clipboard.writeText(stateToFen(game));
      setPanelMessage("FEN скопирован.");
    } catch (error) {
      console.error("Could not copy FEN:", error);
      setPanelMessage("Не удалось скопировать FEN.");
    }
  }

  function setTime(seconds: number) {
    setSelectedTime(seconds);
    selectedTimeRef.current = seconds;
    whiteTimeRef.current = seconds;
    blackTimeRef.current = seconds;
    setWhiteTime(seconds);
    setBlackTime(seconds);
  }

  function changeGameMode(mode: "pvp" | "pvc") {
    if (partyInProgress) return;
    setGameMode(mode);
    if (mode === "pvp") setPlayerColor("white");
  }

  function changePlayerColor(color: PieceColor) {
    if (partyInProgress) return;
    setPlayerColor(color);
  }

  function formatTime(seconds: number) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  const materialValues: Record<Piece["type"], number> = {
    king: 0,
    queen: 9,
    rook: 5,
    bishop: 3,
    knight: 3,
    pawn: 1,
  };
  const material = game.board.flat().reduce(
    (total, piece) => {
      if (piece) total[piece.color] += materialValues[piece.type];
      return total;
    },
    { white: 0, black: 0 },
  );

  return (
    <>
      <header>
        <h1 onClick={() => setActiveTab("landing")}>♔ Chess Master ♚</h1>
        <nav className="site-nav" aria-label="Основные страницы">
          <a href="#game" aria-current={gameActive ? "page" : undefined} onClick={() => setActiveTab("game")}>Игра</a>
          <Link href="/pay">Premium</Link>
          {account?.role === "admin" && <Link href="/admin">Админка</Link>}
        </nav>
        <div className="header-right">
          <div className="header-toolbar">
            <div className="theme-toggle">
              <label title="Переключить тему">
                <input type="checkbox" checked={lightTheme} onChange={(event) => changeTheme(event.target.checked)} />
                🌙
              </label>
            </div>
            {!account && (
              <button id="login-button" className="auth-button" onClick={() => setAuthOpen(true)}>
                Войти / Регистрация
              </button>
            )}
          </div>
          {account && (
            <div id="user-profile">
              <ProfileSummary />
              <button className="logout-button" onClick={handleLogout} disabled={busy}>🚪 Выйти</button>
            </div>
          )}
        </div>
      </header>

      {authOpen && !account && (
        <div className="auth-modal" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeAuth();
        }}>
          <div className="auth-modal-content">
            <div className="auth-modal-header">
              <h2>{authMode === "register" ? "⚡ Регистрация" : "🔑 Вход"}</h2>
              <button className="auth-modal-close" type="button" onClick={closeAuth} aria-label="Закрыть">&times;</button>
            </div>
            <form id="auth-form" onSubmit={handleAuth}>
              <div className="auth-form-group">
                <label htmlFor="auth-username">Username</label>
                <input
                  type="text"
                  id="auth-username"
                  autoComplete="username"
                  placeholder="Введите ваш ник..."
                  required
                  maxLength={50}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
              <div className="auth-form-group">
                <label htmlFor="auth-password">Password</label>
                <input
                  type="password"
                  id="auth-password"
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  placeholder="Введите пароль..."
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {message && <div id="auth-error" className="auth-error" role="status">{message}</div>}
              <button type="submit" className="auth-submit-btn" disabled={busy}>
                {busy ? "Подождите…" : authMode === "register" ? "🚀 Зарегистрироваться" : "🔑 Войти"}
              </button>
            </form>
            <div className="auth-modal-footer">
              <p>{authMode === "register" ? "Уже регистрировались?" : "Нет аккаунта?"}{" "}
                <a href="#" onClick={(event) => { event.preventDefault(); toggleAuthMode(); }}>
                  {authMode === "register" ? "Войти" : "Зарегистрироваться"}
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      <main className="container">
        <nav className="tabs" aria-label="Разделы сайта">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button${activeTab === tab.id ? " active" : ""}`}
              data-tab={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setPanelMessage("");
                if (tab.id === "analyze") setAnalysisStep(past.length);
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <section id="landing" className={`tab-content${activeTab === "landing" ? " active" : ""}`}>
          <div className="landing-container">
            <div className="landing-content">
              <div className="landing-title">
                <span className="title-emoji">♔</span>
                <h2>Chess Master</h2>
                <span className="title-emoji">♚</span>
              </div>
              <p className="landing-subtitle">Стратегическая игра для истинных мастеров</p>
              <button className="play-button-main" onClick={startGame}>🎮 Играть</button>
              <div className="landing-features">
                <div className="feature-item">✨ Играй против AI</div>
                <div className="feature-item">📊 Отслеживай рейтинг</div>
                <div className="feature-item">⏱️ Режим с таймером</div>
              </div>
              <div className="landing-stats">
                <div className="stat-mini">
                  <div className="stat-mini-value">{account?.elo ?? "—"}</div>
                  <div className="stat-mini-label">Ваш Elo</div>
                </div>
                <div className="stat-mini">
                  <div className="stat-mini-value">{history.length}</div>
                  <div className="stat-mini-label">Всего игр</div>
                </div>
                <div className="stat-mini">
                  <div className="stat-mini-value">{history.filter((entry) => entry.result === "win").length}</div>
                  <div className="stat-mini-label">Побед</div>
                </div>
              </div>
              <div className="landing-ai-tips">
                <div className="tip-title">💡 Совет</div>
                <div className="tip-text">Выбери уровень сложности и начни играть!</div>
              </div>
            </div>
            <div className="landing-footer">
              <button className="home-button" onClick={startGame}>← В игру</button>
              <button className="settings-button" onClick={() => setActiveTab("settings")} title="Настройки">⚙️</button>
            </div>
          </div>
        </section>

        <section id="game" className={`tab-content${activeTab === "game" ? " active" : ""}`}>
          <div className="game-top-panel">
            <div className="status" id="status" aria-live="polite">{statusText}</div>
            <div className="timer-display">
              <div className="timer-white">
                <span className="timer-label">⚪ Белые</span>
                <span className="timer-value">{formatTime(whiteTime)}</span>
              </div>
              <div className="timer-black">
                <span className="timer-label">⚫ Чёрные</span>
                <span className="timer-value">{formatTime(blackTime)}</span>
              </div>
            </div>
            <div className="board-size-quick">
              <label>📐 Размер:</label>
              {(["small", "medium", "large"] as const).map((size) => (
                <button
                  key={size}
                  className={`size-btn${boardSize === size ? " active" : ""}`}
                  onClick={() => setBoardSize(size)}
                >
                  {size === "small" ? "S" : size === "medium" ? "M" : "L"}
                </button>
              ))}
            </div>
          </div>

          <div className="board-wrapper">
            <ChessBoard
              game={game}
              legalMoves={legalMoves}
              selection={selection}
              size={boardSize}
              boardStyle={boardStyle}
              coordinatesShown={coordinatesShown}
              disabled={Boolean(gameResult) || botTurn}
              onSquareClick={handleSquareClick}
            />
            {materialShown && (
              <div className="material-balance" id="material-balance">
                <span>⚪ {material.white}</span>
                <span>⚫ {material.black}</span>
              </div>
            )}
          </div>

          <div className="moves-panel">
            <div className="current-moves" id="current-moves">
              {movePairs.length ? movePairs.map((pair) => (
                <span className="move" key={pair.number}>
                  {pair.number}. {pair.white} {pair.black ?? "…"}
                </span>
              )) : <span className="no-games">Сделайте первый ход.</span>}
            </div>
            {gameResult && (
              <p className="game-record-result">{gameResult === "win" ? "Победа" : gameResult === "loss" ? "Поражение" : "Ничья"}</p>
            )}
            {autoSaveState && <p className="chat-note" aria-live="polite">{autoSaveState}</p>}
            {gameResult && !account && <p className="chat-note">Войдите, чтобы сохранить результат.</p>}
          </div>

          <div className="controls">
            <label>⏱️ Время на партию:</label>
            <div className="button-group">
              {[["1м", 60], ["3м", 180], ["5м", 300], ["10м", 600], ["15м", 900], ["30м", 1800]].map(([label, seconds]) => (
                <button
                  key={seconds}
                  type="button"
                  className={selectedTime === seconds ? "success" : ""}
                  onClick={() => setTime(Number(seconds))}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>🎯 Режим игры:</label>
            <div className="button-group">
              <button className={gameMode === "pvp" ? "success" : ""} disabled={partyInProgress} title={partyInProgress ? "Доступно с новой партии" : undefined} onClick={() => changeGameMode("pvp")}>👥 Человек vs Человек</button>
              <button className={gameMode === "pvc" ? "success" : ""} disabled={partyInProgress} title={partyInProgress ? "Доступно с новой партии" : undefined} onClick={() => changeGameMode("pvc")}>🤖 vs Компьютер</button>
            </div>
            {gameMode === "pvc" && (
              <>
                <label>Играть за:</label>
                <div className="button-group">
                  <button className={playerColor === "white" ? "success" : ""} disabled={partyInProgress} title={partyInProgress ? "Доступно с новой партии" : undefined} onClick={() => changePlayerColor("white")}>⚪ Белые</button>
                  <button className={playerColor === "black" ? "success" : ""} disabled={partyInProgress} title={partyInProgress ? "Доступно с новой партии" : undefined} onClick={() => changePlayerColor("black")}>⚫ Чёрные</button>
                </div>
                <label>🎚️ Уровень сложности:</label>
                <div className="button-group">
                  {[["🟢 Новичок", 1], ["🟡 Средний", 5], ["🔴 Мастер", 10], ["🔴 Гроссмейстер", 20]].map(([label, level]) => (
                    <button
                      key={level}
                      className={difficulty === level ? "success" : ""}
                      disabled={partyInProgress || (level === 20 && account?.is_premium !== true)}
                      title={partyInProgress ? "Доступно с новой партии" : level === 20 && account?.is_premium !== true ? "Доступно только Premium-пользователям" : undefined}
                      onClick={() => changeDifficulty(Number(level))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {partyInProgress && <small className="secondary-text">Доступно с новой партии.</small>}
                {!partyInProgress && account?.is_premium !== true && <small className="secondary-text">Гроссмейстер доступен Premium-пользователям.</small>}
              </>
            )}
            <div id="opponent-info">
              <div className="secondary-text">Соперник</div>
              <div>{gameMode === "pvc" ? "Компьютер" : "Игрок 2"}</div>
              <div>{gameMode === "pvc" ? ({ 1: 800, 5: 1200, 10: 1600, 20: 2000 }[activeDifficulty] ?? 800) : "—"} Elo</div>
              <div>★★★☆☆</div>
            </div>
          </div>

          <div className="button-row">
            <button onClick={undoMove} disabled={!past.length || botTurn || Boolean(gameResult)}>↶ Отменить ход</button>
            <button onClick={startNewGame} className="primary">🔄 Новая игра</button>
            <button onClick={() => setGameResult("loss")} className="danger" disabled={Boolean(gameResult) || !partyStarted}>🚩 Сдаться</button>
            <button onClick={() => setGameResult("draw")} disabled={Boolean(gameResult) || !partyStarted}>🤝 Ничья</button>
            <button onClick={exportMoves}>📄 Скачать PGN</button>
            <button onClick={copyFen}>📋 FEN</button>
          </div>
          <div className="fen-controls">
            <input
              value={fenInput}
              onChange={(event) => setFenInput(event.target.value)}
              placeholder="Вставьте FEN позицию..."
              aria-label="FEN позиция"
            />
            <button onClick={loadFenPosition}>Загрузить позицию</button>
            {panelMessage && <p role="status">{panelMessage}</p>}
          </div>
        </section>

        <section id="rules" className={`tab-content${activeTab === "rules" ? " active" : ""}`}>
          <div className="rules">
            <h2>📚 Правила шахмат</h2>
            <p>Шахматы — это стратегическая настольная игра для двух игроков. Цель игры — поставить мат королю противника, то есть создать ситуацию, когда король находится под шахом и нет возможности уйти от шаха.</p>
            <h3>♟️ Фигуры и их ходы:</h3>
            <ul>
              <li><strong>Король (♔ ♚):</strong> Ходит на одну клетку в любом направлении. Может рокироваться. Это самая важная фигура.</li>
              <li><strong>Ферзь (♕ ♛):</strong> Ходит по горизонтали, вертикали и диагонали на любое количество клеток. Самая сильная фигура.</li>
              <li><strong>Ладья (♖ ♜):</strong> Ходит по горизонтали и вертикали на любое количество клеток.</li>
              <li><strong>Слон (♗ ♝):</strong> Ходит по диагонали на любое количество клеток.</li>
              <li><strong>Конь (♘ ♞):</strong> Ходит буквой «Г» и может перепрыгивать через фигуры.</li>
              <li><strong>Пешка (♙ ♟):</strong> Ходит вперёд на одну клетку, бьёт по диагонали; с начальной позиции может идти на две клетки.</li>
            </ul>
            <h3>⚔️ Особые ходы:</h3>
            <ul>
              <li><strong>Рокировка:</strong> Король и ладья перемещаются одновременно, если путь свободен и король не проходит через шах.</li>
              <li><strong>Взятие на проходе:</strong> Пешка может взять пешку противника, которая прошла мимо неё на две клетки.</li>
              <li><strong>Превращение пешки:</strong> Пешка, достигшая последней горизонтали, превращается в ферзя.</li>
            </ul>
            <h3>✔️ Результаты игры:</h3>
            <ul>
              <li><strong>Шах:</strong> Король под атакой, но есть способ защиты.</li>
              <li><strong>Мат:</strong> Король под шахом и не может защититься — конец игры.</li>
              <li><strong>Пат:</strong> Легальных ходов нет, но король не под шахом — ничья.</li>
            </ul>
            <p><em>Игра продолжается до мата, пата или ничьей.</em></p>
          </div>
        </section>

        <section id="chat" className={`tab-content${activeTab === "chat" ? " active" : ""}`}>
          <ChatPanel account={account} active={activeTab === "chat"} />
        </section>

        <section id="leaderboard" className={`tab-content${activeTab === "leaderboard" ? " active" : ""}`}>
          <div className="leaderboard-panel">
            <h2>🏆 Таблица Лидеров</h2>
            <div id="leaderboard-user-rank" className="leaderboard-user-rank">{panelMessage}</div>
            <ol id="leaderboard-content" className="leaderboard-list">
              {leaderboard.map((player, index) => (
                <li className={`leaderboard-item${index < 3 ? " top3" : ""}`} key={`${player.username}-${index}`}>
                  <span className="leaderboard-rank">{player.rank}</span>
                  <span className="leaderboard-name">{player.username}</span>
                  <span className="leaderboard-league">{player.league}</span>
                  <span className="leaderboard-elo">{player.elo}</span>
                </li>
              ))}
              {!leaderboard.length && <li className="leaderboard-loading">{panelMessage || "Загрузка лидеров..."}</li>}
            </ol>
            <button onClick={() => { setPanelMessage(""); setLeaderboard([]); setLeaderboardRefresh((count) => count + 1); }} className="refresh-btn">🔄 Обновить</button>
          </div>
        </section>

        <section id="history" className={`tab-content${activeTab === "history" ? " active" : ""}`}>
          <div className="game-history">
            <h2>📊 История партий</h2>
            {!account ? (
              <div className="no-games"><p>📭 Войдите в аккаунт, чтобы загрузить историю партий с сервера.</p></div>
            ) : panelMessage ? (
              <div className="no-games">{panelMessage}</div>
            ) : history.length ? history.map((entry) => (
              <article className="game-record" key={entry.id}>
                <div className="game-record-header">
                  <span className="game-record-title">Партия #{entry.id}</span>
                  <span className="game-record-date">{new Date(entry.createdAt).toLocaleString("ru-RU")}</span>
                </div>
                <span className={`game-record-result ${entry.result}`}>
                  {entry.result === "win" ? "Победа" : entry.result === "loss" ? "Поражение" : "Ничья"}
                </span>
                <p className="game-record-moves">{entry.moves}</p>
                <button type="button" onClick={() => replayHistory(entry)}>▶ Просмотреть партию</button>
              </article>
            )) : <div className="no-games">Сохранённых партий пока нет.</div>}
            {historyReplay && (
              <div className="history-replay">
                <h3>Просмотр партии #{historyReplay.gameId}</h3>
                <div className="board-wrapper">
                  <ChessBoard
                    game={historyReplayGame ?? createInitialState()}
                    legalMoves={historyReplayGame ? getLegalMoves(historyReplayGame) : []}
                    selection={null}
                    size="small"
                    boardStyle="default"
                    boardId="history-replay-board"
                    coordinatesShown
                    disabled
                    onSquareClick={() => undefined}
                  />
                </div>
                <p>{historyReplay.moves[historyReplay.currentIndex - 1] ?? "Начальная позиция"}</p>
                <div className="button-row">
                  <button
                    type="button"
                    disabled={historyReplay.currentIndex === 0}
                    onClick={() => setHistoryReplay((current) => current
                      ? { ...current, currentIndex: Math.max(0, current.currentIndex - 1) }
                      : current)}
                  >← Назад</button>
                  <button
                    type="button"
                    disabled={historyReplay.currentIndex >= historyReplay.states.length - 1}
                    onClick={() => setHistoryReplay((current) => current
                      ? { ...current, currentIndex: Math.min(current.states.length - 1, current.currentIndex + 1) }
                      : current)}
                  >Вперёд →</button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section id="analyze" className={`tab-content${activeTab === "analyze" ? " active" : ""}`}>
          <div className="analyze-panel">
            <h2>🔍 Анализ партии</h2>
            <p className="analysis-note">Просмотр ходов партии и оценка материала.</p>
            <div className="stats-grid">
              <div className="stat-box"><label>Оценка материала:</label><div>{(() => {
                const balance = analysisGame.board.flat().reduce((score, piece) => {
                  if (!piece) return score;
                  return score + (piece.color === "white" ? 1 : -1) * materialValues[piece.type];
                }, 0);
                return balance > 0 ? `+${balance}` : balance;
              })()}</div></div>
              <div className="stat-box"><label>Легальных ходов:</label><div>{getLegalMoves(analysisGame).length}</div></div>
            </div>
            <div className="board-wrapper">
              <ChessBoard
                game={analysisGame}
                legalMoves={getLegalMoves(analysisGame)}
                selection={null}
                size="small"
                boardStyle="default"
                boardId="analysis-board"
                coordinatesShown
                disabled
                onSquareClick={() => undefined}
              />
            </div>
            <div className="button-row">
              <button disabled={analysisIndex === 0} onClick={() => setAnalysisStep(Math.max(0, analysisIndex - 1))}>← Назад</button>
              <span>{analysisIndex} / {analysisStates.length - 1}</span>
              <button disabled={analysisIndex >= analysisStates.length - 1} onClick={() => setAnalysisStep(Math.min(analysisStates.length - 1, analysisIndex + 1))}>Вперёд →</button>
            </div>
            <h3>Ходы партии:</h3>
            <div>{(past[analysisIndex]?.moves.join(" ") ?? moves.join(" ")) || "Начните игру, чтобы просмотреть ходы."}</div>
            <h3>Экспорт:</h3>
            <div className="button-row"><button onClick={exportMoves}>📄 Скачать PGN</button></div>
          </div>
        </section>

        <section id="puzzles" className={`tab-content${activeTab === "puzzles" ? " active" : ""}`}>
          <PuzzlePanel userId={account?.id ?? null} />
        </section>

        <section id="online" className={`tab-content${activeTab === "online" ? " active" : ""}`}>
          <OnlinePanel
            account={account}
            onProfile={(profile) => setAccount((previous) =>
              previous ? { ...previous, ...profile } : previous)}
          />
        </section>

        <section id="settings" className={`tab-content${activeTab === "settings" ? " active" : ""}`}>
          <div className="settings-panel">
            <h2>⚙️ Настройки</h2>
            <div className="settings-group">
              <label><input type="checkbox" defaultChecked /> 🔊 Звуки ходов</label>
            </div>
            <div className="settings-group">
              <label><input type="checkbox" defaultChecked /> ✨ Анимация ходов</label>
            </div>
            <div className="settings-group">
              <label><input type="checkbox" checked={coordinatesShown} onChange={(event) => setCoordinatesShown(event.target.checked)} /> 📍 Показать координаты</label>
            </div>
            <div className="settings-group">
              <label><input type="checkbox" checked={materialShown} onChange={(event) => setMaterialShown(event.target.checked)} /> ⚖️ Оценка материала</label>
            </div>
            <div className="settings-group">
              <label htmlFor="board-style">Стиль доски:</label>
              <select id="board-style" value={boardStyle} onChange={(event) => setBoardStyle(event.target.value)}>
                <option value="default">Классический</option>
                <option value="blue">Синий</option>
                <option value="green">Зелёный</option>
                <option value="wood">Дерево</option>
              </select>
            </div>
            <div className="settings-group">
              <label htmlFor="board-size">Размер доски:</label>
              <select id="board-size" value={boardSize} onChange={(event) => setBoardSize(event.target.value as typeof boardSize)}>
                <option value="small">Маленькая</option>
                <option value="medium">Средняя</option>
                <option value="large">Большая</option>
              </select>
            </div>
            <div className="settings-group">
              <label>Тёмная тема:</label>
              <label className="switch">
                <input type="checkbox" checked={lightTheme} onChange={(event) => changeTheme(event.target.checked)} />
                <span className="slider round" />
              </label>
            </div>
            <div className="settings-group">
              <label><strong>♛ Ваш рейтинг Elo:</strong></label>
              <div className="elo-display">
                <div className="elo-rating-big">{account?.elo ?? "—"}</div>
                <div className="elo-category">{account?.league ?? "Войдите, чтобы увидеть рейтинг"}</div>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className={`tab-content${activeTab === "about" ? " active" : ""}`}>
          <div className="about">
            <h2>ℹ️ О программе</h2>
            <p>Добро пожаловать на <strong>Chess Master</strong> — шахматный сайт для игры и развития рейтинга.</p>
            <h3>🎮 Возможности:</h3>
            <ul>
              <li>Полная поддержка легальных ходов, шаха, мата, пата и рокировки.</li>
              <li>Игра против компьютера с несколькими уровнями сложности.</li>
              <li>Отмена хода, история ходов и таблица лидеров.</li>
              <li>Регистрация, профиль и сохранение Elo.</li>
            </ul>
          </div>
        </section>
      </main>
    </>
  );
}

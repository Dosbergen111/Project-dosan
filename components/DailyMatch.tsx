"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChessBoard from "@/components/ChessBoard";
import type { Account } from "@/components/AuthProvider";
import { createInitialState, stateFromFen, stateToFen } from "@/lib/chess/board";
import { moveToUci } from "@/lib/chess/moves";
import { gameOutcome, getLegalMoves, makeMove } from "@/lib/chess/rules";
import type { ChessMove, GameState, PieceColor } from "@/lib/chess/types";

type GameResult = "win" | "loss" | "draw";
type MatchResult = {
  date: string;
  result: GameResult;
  elo: number;
  eloChange: number;
  league: string;
};
type SavedMatch = {
  date: string;
  fen: string;
  moves: string[];
  result: GameResult | null;
};
type Props = {
  account: Account | null;
  isSessionLoading: boolean;
  onProfile: (profile: Pick<Account, "elo" | "league">) => void;
};

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function resultFromState(state: GameState, outcome: ReturnType<typeof gameOutcome>): GameResult | null {
  if (!outcome) return null;
  if (outcome !== "checkmate") return "draw";
  return state.turn === "white" ? "loss" : "win";
}

function resultLabel(result: GameResult): string {
  return result === "win" ? "Победа" : result === "loss" ? "Поражение" : "Ничья";
}

export default function DailyMatch({ account, isSessionLoading, onProfile }: Props) {
  const [game, setGame] = useState<GameState>(() => createInitialState());
  const [moves, setMoves] = useState<string[]>([]);
  const [selection, setSelection] = useState<{ row: number; col: number } | null>(null);
  const [started, setStarted] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [savedMatch, setSavedMatch] = useState<MatchResult | null>(null);
  const [activeDate, setActiveDate] = useState("");
  const [loadedForUserId, setLoadedForUserId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const savedGames = useRef(new Set<string>());
  const legalMoves = getLegalMoves(game);
  const outcome = gameOutcome(game);
  const botTurn = started && !gameResult && game.turn === "black" && !outcome;
  const isLoading = Boolean(account && loadedForUserId !== account.id);

  useEffect(() => {
    if (!account) return;

    let active = true;
    const date = utcDate();
    const userId = account.id;
    const storageKey = `chessDailyMatch:${userId}:${date}`;

    async function loadMatch() {
      try {
        const response = await fetch("/api/daily-match", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          match?: MatchResult | null;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить дневной матч.");
        if (!active) return;
        if (data.match) {
          setSavedMatch(data.match);
          setStarted(false);
          return;
        }

        const rawSaved = window.localStorage.getItem(storageKey);
        if (!rawSaved) {
          setSavedMatch(null);
          setStarted(false);
          return;
        }
        const saved = JSON.parse(rawSaved) as Partial<SavedMatch>;
        if (
          saved.date !== date ||
          typeof saved.fen !== "string" ||
          !Array.isArray(saved.moves) ||
          !saved.moves.every((move) => typeof move === "string")
        ) {
          throw new Error("Сохранённое состояние дневного матча повреждено.");
        }
        const restoredGame = stateFromFen(saved.fen);
        if (!restoredGame) throw new Error("Не удалось восстановить позицию дневного матча.");
        setGame(restoredGame);
        setMoves(saved.moves);
        setGameResult(saved.result === "win" || saved.result === "loss" || saved.result === "draw" ? saved.result : null);
        setActiveDate(date);
        setStarted(true);
        setSavedMatch(null);
      } catch (cause) {
        if (active) {
          console.error("Could not load daily match:", cause);
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить дневной матч.");
        }
      } finally {
        if (active) setLoadedForUserId(userId);
      }
    }

    void loadMatch();
    return () => {
      active = false;
    };
  }, [account]);

  const persistMatch = useCallback((date: string, nextGame: GameState, nextMoves: string[], result: GameResult | null) => {
    if (!account) return;
    try {
      window.localStorage.setItem(
        `chessDailyMatch:${account.id}:${date}`,
        JSON.stringify({
          date,
          fen: stateToFen(nextGame),
          moves: nextMoves,
          result,
        } satisfies SavedMatch),
      );
    } catch (cause) {
      console.error("Could not persist daily match:", cause);
      setError("Не удалось сохранить состояние матча на этом устройстве.");
    }
  }, [account]);

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
      const nextMoves = [...moves, moveToUci(move)];
      setGame(next);
      setMoves(nextMoves);
      const result = resultFromState(next, gameOutcome(next));
      persistMatch(activeDate, next, nextMoves, result);
      if (result) setGameResult(result);
    };
    worker.onerror = (event) => {
      console.error("Daily match bot worker failed:", event.message);
      setError("Не удалось рассчитать ход соперника.");
    };
    worker.postMessage({ state: game, difficulty: 5, botColor: "black" satisfies PieceColor });
    return () => worker.terminate();
  }, [activeDate, botTurn, game, moves, persistMatch]);

  useEffect(() => {
    if (!account || !started || !gameResult || !activeDate || savedMatch) return;
    const key = `${account.id}:${activeDate}`;
    if (savedGames.current.has(key)) return;
    savedGames.current.add(key);
    setSaving(true);
    setError("");

    void fetch("/api/save-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result: gameResult,
        fen: stateToFen(game),
        moves: moves.join(" "),
        gameMode: "pvc",
        difficulty: 5,
        dailyMatch: true,
      }),
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          dailyMatch?: MatchResult;
          error?: string;
        };
        if (!response.ok) {
          if (response.status === 409) {
            const statusResponse = await fetch("/api/daily-match", {
              cache: "no-store",
            });
            const status = (await statusResponse.json()) as { match?: MatchResult | null; error?: string };
            if (statusResponse.ok && status.match) {
              setSavedMatch(status.match);
              onProfile({ elo: status.match.elo, league: status.match.league });
              return;
            }
          }
          throw new Error(data.error ?? "Не удалось сохранить дневной матч.");
        }
        if (!data.dailyMatch) throw new Error("Сервер не подтвердил результат дневного матча.");
        setSavedMatch(data.dailyMatch);
        onProfile({ elo: data.dailyMatch.elo, league: data.dailyMatch.league });
      })
      .catch((cause: unknown) => {
        console.error("Could not save daily match:", cause);
        setError(cause instanceof Error ? cause.message : "Не удалось сохранить дневной матч.");
        savedGames.current.delete(key);
      })
      .finally(() => setSaving(false));
  }, [account, activeDate, game, gameResult, moves, onProfile, retryCount, savedMatch, started]);

  function startMatch() {
    if (!account || isLoading || savedMatch || started || error) return;
    setGame(createInitialState());
    setMoves([]);
    setSelection(null);
    setGameResult(null);
    setActiveDate(utcDate());
    setStarted(true);
    setError("");
    persistMatch(utcDate(), createInitialState(), [], null);
  }

  function clickSquare(row: number, col: number) {
    if (!started || gameResult || botTurn || game.turn !== "white") return;
    const piece = game.board[row][col];
    if (!selection) {
      if (piece?.color === "white") setSelection({ row, col });
      return;
    }

    const move = legalMoves.find((candidate) =>
      candidate.from.row === selection.row &&
      candidate.from.col === selection.col &&
      candidate.to.row === row &&
      candidate.to.col === col,
    );
    if (move) {
      const next = makeMove(game, move);
      if (next) {
        const nextMoves = [...moves, moveToUci(move)];
        setGame(next);
        setMoves(nextMoves);
        const result = resultFromState(next, gameOutcome(next));
        persistMatch(activeDate, next, nextMoves, result);
        if (result) setGameResult(result);
      }
      setSelection(null);
    } else if (piece?.color === "white") {
      setSelection({ row, col });
    } else {
      setSelection(null);
    }
  }

  function finishMatch(result: GameResult) {
    if (!started || gameResult) return;
    setGameResult(result);
    persistMatch(activeDate, game, moves, result);
  }

  return (
    <section className="panel daily-match-card">
      <div className="daily-match-heading">
        <div>
          <span className="page-badge">Один рейтинговый матч в день · UTC</span>
          <h2>Дневной матч</h2>
        </div>
        <span className="daily-opponent">🤖 Средний · 1200 Elo</span>
      </div>
      {isSessionLoading ? (
        <p className="daily-message" role="status">Загружаем профиль…</p>
      ) : !account ? (
        <p className="daily-message">Войдите, чтобы участвовать.</p>
      ) : isLoading ? (
        <p className="daily-message" role="status">Загружаем результат дня…</p>
      ) : savedMatch ? (
        <div className="daily-result" role="status">
          <strong>Результат дня: {resultLabel(savedMatch.result)}</strong>
          <span>Elo {savedMatch.eloChange > 0 ? "+" : ""}{savedMatch.eloChange} · рейтинг {savedMatch.elo}</span>
          <small>Новый матч будет доступен завтра по UTC.</small>
        </div>
      ) : (
        <>
          {started ? (
            <div className="daily-game">
              <p className="daily-message">
                {gameResult ? `Результат: ${resultLabel(gameResult)}.` : botTurn ? "Ход соперника…" : "Вы играете белыми."}
              </p>
              <div className="board-wrapper">
                <ChessBoard
                  game={game}
                  legalMoves={legalMoves}
                  selection={selection}
                  size="medium"
                  boardStyle="default"
                  boardId="daily-match-board"
                  coordinatesShown
                  disabled={Boolean(gameResult) || botTurn}
                  onSquareClick={clickSquare}
                />
              </div>
              <p className="daily-message">Ходы: {moves.length ? moves.join(" ") : "—"}</p>
              {!gameResult && (
                <div className="button-row">
                  <button type="button" className="danger" onClick={() => finishMatch("loss")}>Сдаться</button>
                  <button type="button" onClick={() => finishMatch("draw")}>Зафиксировать ничью</button>
                </div>
              )}
              {saving && <p className="payment-status" role="status">Сохраняем результат и обновляем Elo…</p>}
            </div>
          ) : (
            <p className="daily-message">Сыграйте одну рейтинговую партию против бота среднего уровня.</p>
          )}
          {error && <p className="chat-error" role="alert">{error}</p>}
          {started && gameResult && error && (
            <button type="button" className="button button-secondary" disabled={saving} onClick={() => {
              savedGames.current.delete(`${account.id}:${activeDate}`);
              setRetryCount((count) => count + 1);
            }}>Повторить сохранение</button>
          )}
          {!started && (
            <button
              type="button"
              className="button button-primary"
              disabled={Boolean(error)}
              title={error ? "Не удалось проверить результат дня" : undefined}
              onClick={startMatch}
            >
              Начать дневной матч
            </button>
          )}
        </>
      )}
    </section>
  );
}

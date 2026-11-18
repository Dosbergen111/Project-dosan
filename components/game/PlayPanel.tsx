"use client";

import { FormEvent, useEffect, useState } from "react";
import Board from "@/components/chess/Board";
import { useGame } from "@/components/chess/GameProvider";
import { useAuth, type Account } from "@/components/AuthProvider";
import { stateToFen } from "@/lib/chess/board";
import { levelByDifficulty } from "@/lib/chess/levels";

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function PlayPanel() {
  const { account, setAccount } = useAuth();
  const game = useGame();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fenInput, setFenInput] = useState("");
  const [fenMessage, setFenMessage] = useState("");

  useEffect(() => {
    const openAuth = () => setAuthOpen(true);
    window.addEventListener("open-chess-auth", openAuth);
    return () => window.removeEventListener("open-chess-auth", openAuth);
  }, []);

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
      const data = await response.json() as Account & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Ошибка запроса (${response.status}).`);
      if (authMode === "register") {
        game.resetLocalGame(null);
        setAuthMode("login");
        setPassword("");
        setMessage("Регистрация прошла успешно. Теперь войдите.");
      } else {
        setAccount(data);
        game.resetLocalGame(data.id);
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

  function requestHint() {
    if (game.gameMode !== "pvc" || game.gameResult || game.botTurn || !game.legalMoves.length) return;
    const limit = account?.is_premium ? Infinity : 3;
    if (game.hintsUsed >= limit) return;
    const move = game.legalMoves[0];
    game.setSelection(move.from);
    game.setHintMessage(`Попробуйте ${String.fromCharCode(97 + move.from.col)}${8 - move.from.row} → ${String.fromCharCode(97 + move.to.col)}${8 - move.to.row}.`);
    game.setHintsUsed((used) => used + 1);
  }

  function exportMoves() {
    const content = `1. ${game.moves.join(" ")}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "chess-game.pgn";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function copyFen() {
    await navigator.clipboard.writeText(stateToFen(game.game));
  }

  const movePairs = Array.from({ length: Math.ceil(game.moves.length / 2) }, (_, index) => ({
    number: index + 1,
    white: game.moves[index * 2],
    black: game.moves[index * 2 + 1],
  }));
  const statusText = game.outcome
    ? game.outcome === "checkmate"
      ? game.game.turn === game.playerColor ? "Мат — вы проиграли!" : "Мат — вы победили!"
      : "Ничья."
    : `${game.check ? "Шах! " : ""}Ход ${game.game.turn === "white" ? "белых" : "чёрных"}${game.botTurn ? " — компьютер думает…" : ""}`;
  const hintLimit = account?.is_premium ? Infinity : 3;
  const hintsRemaining = Math.max(0, hintLimit - game.hintsUsed);
  const material = game.game.board.flat().reduce((total, piece) => {
    if (!piece) return total;
    const values = { king: 0, queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1 };
    total[piece.color] += values[piece.type];
    return total;
  }, { white: 0, black: 0 });

  return (
    <>
      {authOpen && !account && (
        <div className="auth-modal" onMouseDown={(event) => event.target === event.currentTarget && setAuthOpen(false)}>
          <div className="auth-modal-content">
            <div className="auth-modal-header">
              <h2>{authMode === "register" ? "⚡ Регистрация" : "🔑 Вход"}</h2>
              <button className="auth-modal-close" type="button" onClick={() => setAuthOpen(false)} aria-label="Закрыть">&times;</button>
            </div>
            <form onSubmit={handleAuth}>
              <div className="auth-form-group">
                <label htmlFor="auth-username">Username</label>
                <input id="auth-username" autoComplete="username" required maxLength={50} value={username} onChange={(event) => setUsername(event.target.value)} />
              </div>
              <div className="auth-form-group">
                <label htmlFor="auth-password">Password</label>
                <input id="auth-password" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              {message && <div className="auth-error" role="status">{message}</div>}
              <button type="submit" className="auth-submit-btn" disabled={busy}>{busy ? "Подождите…" : authMode === "register" ? "🚀 Зарегистрироваться" : "🔑 Войти"}</button>
            </form>
          </div>
        </div>
      )}
      <section id="game" className="tab-content active">
        <div className="game-top-panel">
          <div className="status" aria-live="polite">{statusText}</div>
          <div className="timer-display">
            <div className="timer-white"><span className="timer-label">⚪ Белые</span><span className="timer-value">{formatTime(game.whiteTime)}</span></div>
            <div className="timer-black"><span className="timer-label">⚫ Чёрные</span><span className="timer-value">{formatTime(game.blackTime)}</span></div>
          </div>
          <div className="board-size-quick">
            <label>📐 Размер:</label>
            {(["small", "medium", "large"] as const).map((size) => (
              <button key={size} className={`size-btn${game.boardSize === size ? " active" : ""}`} onClick={() => game.setBoardSize(size)}>
                {size === "small" ? "S" : size === "medium" ? "M" : "L"}
              </button>
            ))}
          </div>
        </div>
        <div className="board-wrapper">
          <Board
            game={game.game}
            legalMoves={game.legalMoves}
            selection={game.selection}
            size={game.boardSize}
            boardStyle={game.boardStyle}
            coordinatesShown={game.coordinatesShown}
            disabled={Boolean(game.gameResult) || game.botTurn}
            onSquareClick={game.handleSquareClick}
          />
          {game.materialShown && <div className="material-balance"><span>⚪ {material.white}</span><span>⚫ {material.black}</span></div>}
        </div>
        <div className="moves-panel">
          <div className="current-moves">
            {movePairs.length ? movePairs.map((pair) => <span className="move" key={pair.number}>{pair.number}. {pair.white} {pair.black ?? "…"}</span>) : <span className="no-games">Сделайте первый ход.</span>}
          </div>
          {game.gameResult && <p className="game-record-result">{game.gameResult === "win" ? "Победа" : game.gameResult === "loss" ? "Поражение" : "Ничья"}</p>}
          {game.autoSaveState && <p className="chat-note" aria-live="polite">{game.autoSaveState}</p>}
        </div>
        <div className="controls">
          <label>⏱️ Время на партию:</label>
          <div className="button-group">
            {[["1м", 60], ["3м", 180], ["5м", 300], ["10м", 600], ["15м", 900], ["30м", 1800]].map(([label, seconds]) => (
              <button key={seconds} className={game.selectedTime === seconds ? "success" : ""} onClick={() => game.setTime(Number(seconds))}>{label}</button>
            ))}
          </div>
          <label>🎯 Режим игры:</label>
          <div className="button-group">
            <button className={game.gameMode === "pvp" ? "success" : ""} disabled={game.partyInProgress} onClick={() => game.changeGameMode("pvp")}>👥 Человек vs Человек</button>
            <button className={game.gameMode === "pvc" ? "success" : ""} disabled={game.partyInProgress} onClick={() => game.changeGameMode("pvc")}>🤖 vs Компьютер</button>
          </div>
          {game.gameMode === "pvc" && (
            <>
              <label>💡 Подсказки:</label>
              <div className="button-group">
                <button type="button" disabled={Boolean(game.gameResult) || game.botTurn || !game.legalMoves.length || hintsRemaining === 0} onClick={requestHint}>
                  {account?.is_premium ? "Подсказка · ∞" : `Подсказка · ${hintsRemaining}/3`}
                </button>
              </div>
              {game.hintMessage && <small className="secondary-text" role="status">{game.hintMessage}</small>}
              <label>Играть за:</label>
              <div className="button-group">
                <button className={game.playerColor === "white" ? "success" : ""} disabled={game.partyInProgress} onClick={() => game.changePlayerColor("white")}>⚪ Белые</button>
                <button className={game.playerColor === "black" ? "success" : ""} disabled={game.partyInProgress} onClick={() => game.changePlayerColor("black")}>⚫ Чёрные</button>
              </div>
              <label>🎚️ Уровень сложности:</label>
              <div className="button-group">
                {[["🟢 Новичок", 1], ["🟡 Средний", 5], ["🔴 Мастер", 10], ["🔴 Гроссмейстер", 20]].map(([label, level]) => (
                  <button key={level} className={game.difficulty === level ? "success" : ""} disabled={game.partyInProgress || (level === 20 && account?.is_premium !== true)} onClick={() => game.changeDifficulty(Number(level))}>{label}</button>
                ))}
              </div>
              <div id="opponent-info">
                <div className="secondary-text">Соперник</div>
                <div>Компьютер</div>
                <div>{levelByDifficulty(game.activeDifficulty).elo} Elo</div>
              </div>
            </>
          )}
        </div>
        <div className="button-row">
          <button onClick={game.undoMove} disabled={!game.past.length || game.botTurn || Boolean(game.gameResult)}>↶ Отменить ход</button>
          <button onClick={game.startNewGame} className="primary">🔄 Новая игра</button>
          <button onClick={() => game.setGameResult("loss")} className="danger" disabled={Boolean(game.gameResult) || !game.partyStarted}>🚩 Сдаться</button>
          <button onClick={() => game.setGameResult("draw")} disabled={Boolean(game.gameResult) || !game.partyStarted}>🤝 Ничья</button>
          <button onClick={exportMoves}>📄 Скачать PGN</button>
          <button onClick={copyFen}>📋 FEN</button>
        </div>
        <div className="fen-controls">
          <input value={fenInput} onChange={(event) => setFenInput(event.target.value)} placeholder="Вставьте FEN позицию..." aria-label="FEN позиция" />
          <button onClick={() => { setFenMessage(game.loadFenPosition(fenInput) ? "" : "Некорректная FEN-позиция."); }}>Загрузить позицию</button>
          {fenMessage && <p role="status">{fenMessage}</p>}
        </div>
      </section>
    </>
  );
}

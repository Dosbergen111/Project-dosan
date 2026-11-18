"use client";

import { useEffect, useState } from "react";
import Board from "@/components/chess/Board";
import { useAuth } from "@/components/AuthProvider";
import { createInitialState } from "@/lib/chess/board";
import { getLegalMoves, makeMove } from "@/lib/chess/rules";
import type { GameState } from "@/lib/chess/types";
import { LiaHistorySolid } from "react-icons/lia";

type HistoryEntry = { id: number; result: string; fen: string; moves: string; createdAt: string };

export default function HistoryPanel() {
  const { account } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [message, setMessage] = useState("");
  const [states, setStates] = useState<GameState[]>([]);
  const [moves, setMoves] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [gameId, setGameId] = useState<number | null>(null);

  useEffect(() => {
    if (!account) return;
    void fetch("/api/history", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { games?: HistoryEntry[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Ошибка загрузки истории.");
        setHistory(data.games ?? []);
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Ошибка загрузки истории."));
  }, [account]);

  function replay(entry: HistoryEntry) {
    const replayStates = [createInitialState()];
    const replayMoves: string[] = [];
    let position = replayStates[0];
    for (const token of entry.moves.split(/[\s,]+/).filter(Boolean)) {
      const match = token.match(/^([a-h][1-8])-?([a-h][1-8])([qrbn])?$/i);
      if (!match) continue;
      const square = (name: string) => ({ row: 8 - Number(name[1]), col: name.charCodeAt(0) - 97 });
      const from = square(match[1].toLowerCase());
      const to = square(match[2].toLowerCase());
      const legal = getLegalMoves(position).find((candidate) => candidate.from.row === from.row && candidate.from.col === from.col && candidate.to.row === to.row && candidate.to.col === to.col);
      if (!legal) break;
      const next = makeMove(position, { ...legal, promotion: match[3] ? ({ q: "queen", r: "rook", b: "bishop", n: "knight" } as const)[match[3].toLowerCase() as "q" | "r" | "b" | "n"] : legal.promotion });
      if (!next) break;
      position = next;
      replayMoves.push(token);
      replayStates.push(position);
    }
    setStates(replayStates);
    setMoves(replayMoves);
    setIndex(replayStates.length - 1);
    setGameId(entry.id);
  }

  return (
    <section className="tab-content active">
      <div className="game-history">
        <h2><LiaHistorySolid aria-hidden="true" /> История партий</h2>
        {!account ? <div className="no-games"><p>Войдите в аккаунт, чтобы загрузить историю партий.</p></div> : message ? <div className="no-games">{message}</div> : history.length ? history.map((entry) => (
          <article className="game-record" key={entry.id}>
            <div className="game-record-header"><span>Партия #{entry.id}</span><span>{new Date(entry.createdAt).toLocaleString("ru-RU")}</span></div>
            <span className={`game-record-result ${entry.result}`}>{entry.result === "win" ? "Победа" : entry.result === "loss" ? "Поражение" : "Ничья"}</span>
            <p className="game-record-moves">{entry.moves}</p>
            <button type="button" onClick={() => replay(entry)}>▶ Просмотреть партию</button>
          </article>
        )) : <div className="no-games">Нет партий.</div>}
        {states.length > 0 && (
          <div className="history-replay">
            <h3>Просмотр партии #{gameId}</h3>
            <Board game={states[index]} legalMoves={getLegalMoves(states[index])} selection={null} size="small" boardStyle="default" boardId="history-replay-board" coordinatesShown disabled onSquareClick={() => undefined} />
            <p>{moves[index - 1] ?? "Начальная позиция"}</p>
            <div className="button-row">
              <button disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>← Назад</button>
              <button disabled={index >= states.length - 1} onClick={() => setIndex((current) => Math.min(states.length - 1, current + 1))}>Вперёд →</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

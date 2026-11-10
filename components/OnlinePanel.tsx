"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChessBoard from "@/components/ChessBoard";
import { stateFromFen } from "@/lib/chess/board";
import { moveToUci } from "@/lib/chess/moves";
import { gameOutcome, getLegalMoves } from "@/lib/chess/rules";
import type { ChessMove, PieceColor, Square } from "@/lib/chess/types";

type Account = {
  id: number;
  username: string;
  sessionToken: string;
  elo: number;
  league: string;
};
type PlayerStatus = { username: string; connected: boolean } | null;
type RoomState = {
  roomId: string;
  color: PieceColor | null;
  started: boolean;
  finished: boolean;
  winner: PieceColor | "draw" | null;
  drawOfferedBy: PieceColor | null;
  version: number;
  turn: PieceColor;
  fen: string;
  moves: string[];
  players: { white: PlayerStatus; black: PlayerStatus };
};
function headers(account: Account | null): HeadersInit {
  return account ? { Authorization: `Bearer ${account.sessionToken}` } : {};
}

export default function OnlinePanel({
  account,
  onProfile,
}: {
  account: Account | null;
  onProfile: (profile: { elo: number; league: string }) => void;
}) {
  const [roomId, setRoomId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerToken, setPlayerToken] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [selection, setSelection] = useState<Square | null>(null);
  const [status, setStatus] = useState("Создайте комнату или введите ссылку приглашения.");
  const [busy, setBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const mountedLinkHandled = useRef(false);
  const roomRef = useRef<RoomState | null>(null);

  const game = useMemo(() => room ? stateFromFen(room.fen) : null, [room]);
  const legalMoves = useMemo(
    () => (game ? getLegalMoves(game) : []),
    [game],
  );
  const canPlay = Boolean(
    room && game && playerToken && room.started && !room.finished &&
      room.color === room.turn && !gameOutcome(game),
  );

  const acceptRoomState = useCallback((incoming: RoomState) => {
    const current = roomRef.current;
    if (
      !current ||
      incoming.roomId !== current.roomId ||
      incoming.version > current.version
    ) {
      roomRef.current = incoming;
      setRoom(incoming);
      setSelection(null);
    } else if (incoming.version === current.version) {
      roomRef.current = incoming;
      setRoom(incoming);
    }
    setRoomId(incoming.roomId);
  }, []);

  const readResponse = async <T,>(response: Response): Promise<T> => {
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `Ошибка запроса (${response.status}).`);
    return data;
  };

  const loadRoom = useCallback(async (id: string, token: string) => {
    const response = await fetch(
      `/api/room/${encodeURIComponent(id)}/state?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const data = await readResponse<{ state: RoomState }>(response);
    acceptRoomState(data.state);
  }, [acceptRoomState]);

  const join = useCallback(async (rawCode: string) => {
    const id = rawCode.trim().match(/(?:\?|&)room=([a-f0-9]{12})/i)?.[1] ??
      rawCode.trim().match(/^[a-f0-9]{12}$/i)?.[0];
    if (!id) throw new Error("Введите 12-значный код комнаты или ссылку приглашения.");

    const stored = localStorage.getItem(`chess-room:${id}`);
    if (stored) {
      try {
        await loadRoom(id, stored);
        setPlayerToken(stored);
        setStatus("Вы вернулись в комнату.");
        return;
      } catch {
        localStorage.removeItem(`chess-room:${id}`);
      }
    }

    const response = await fetch(`/api/room/${encodeURIComponent(id)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers(account) },
      body: JSON.stringify({ userId: account?.id, username: account?.username }),
    });
    const data = await readResponse<{
      playerToken: string;
      color: PieceColor;
      state: RoomState;
    }>(response);
    setPlayerToken(data.playerToken);
    localStorage.setItem(`chess-room:${id}`, data.playerToken);
    acceptRoomState(data.state);
    setStatus("Вы присоединились к партии.");
  }, [account, acceptRoomState, loadRoom]);

  useEffect(() => {
    if (mountedLinkHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("room");
    if (!id) return;
    const timer = window.setTimeout(() => {
      if (mountedLinkHandled.current) return;
      mountedLinkHandled.current = true;
      setJoinCode(id);
      void join(id).catch((cause: unknown) => {
        setStatus(cause instanceof Error ? cause.message : "Не удалось подключиться к комнате.");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [join]);

  useEffect(() => {
    if (!roomId || !playerToken || roomRef.current?.finished) return;
    let active = true;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/room/${encodeURIComponent(roomId)}/state?token=${encodeURIComponent(playerToken)}`,
          { cache: "no-store" },
        );
        const data = await readResponse<{ state: RoomState }>(response);
        if (active) {
          acceptRoomState(data.state);
          if (data.state.finished && account) {
            const profileResponse = await fetch(
              `/api/profile?userId=${account.id}`,
              { headers: headers(account), cache: "no-store" },
            );
            const profile = await readResponse<{
              elo: number;
              league: string;
            }>(profileResponse);
            if (active) onProfile(profile);
          }
          if (data.state.finished) window.clearInterval(timer);
        }
      } catch (cause) {
        if (active) setStatus(cause instanceof Error ? cause.message : "Связь с комнатой потеряна.");
      }
    };
    timer = window.setInterval(() => void poll(), 1800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [roomId, playerToken, acceptRoomState, account, onProfile]);

  const finish = useCallback(async (result: "win" | "loss" | "draw") => {
    if (!roomId || !playerToken || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/room/${encodeURIComponent(roomId)}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers(account) },
        body: JSON.stringify({ playerToken, result }),
      });
      const data = await readResponse<{
        success: boolean;
        drawOffered?: boolean;
        state: RoomState;
        profile?: { elo: number; league: string };
      }>(response);
      acceptRoomState(data.state);
      if (data.profile) onProfile(data.profile);
      setStatus(
        data.drawOffered
          ? "Предложение ничьей отправлено. Ожидается ответ соперника."
          : data.success
            ? "Партия завершена."
            : status,
      );
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Не удалось завершить партию.");
    } finally {
      setBusy(false);
    }
  }, [account, acceptRoomState, busy, onProfile, playerToken, roomId, status]);

  useEffect(() => {
    if (!room || !game || !room.started || room.finished || !room.winner || busy) return;
    const result = room.winner === "draw"
      ? "draw"
      : room.winner === room.color
        ? "win"
        : "loss";
    const timer = window.setTimeout(() => void finish(result), 0);
    return () => window.clearTimeout(timer);
  }, [room, game, busy, finish]);

  async function create() {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers(account) },
        body: JSON.stringify({ userId: account?.id, username: account?.username }),
      });
      const data = await readResponse<{
        roomId: string;
        playerToken: string;
        state: RoomState;
      }>(response);
      setPlayerToken(data.playerToken);
      localStorage.setItem(`chess-room:${data.roomId}`, data.playerToken);
      setJoinCode(data.roomId);
      acceptRoomState(data.state);
      window.history.replaceState(null, "", `/?room=${encodeURIComponent(data.roomId)}`);
      setStatus("Комната создана. Отправьте сопернику код или ссылку.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Не удалось создать комнату.");
    } finally {
      setBusy(false);
    }
  }

  async function joinFromInput() {
    setBusy(true);
    setStatus("");
    try {
      await join(joinCode);
      const id = joinCode.trim().match(/(?:\?|&)room=([a-f0-9]{12})/i)?.[1] ??
        joinCode.trim().match(/^[a-f0-9]{12}$/i)?.[0];
      if (id) window.history.replaceState(null, "", `/?room=${encodeURIComponent(id)}`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Не удалось присоединиться.");
    } finally {
      setBusy(false);
    }
  }

  function clickSquare(row: number, col: number) {
    if (!canPlay || !game || !room) return;
    const piece = game.board[row][col];
    if (!selection) {
      if (piece?.color === room.color) setSelection({ row, col });
      return;
    }
    const move = legalMoves.find(
      (candidate) =>
        candidate.from.row === selection.row && candidate.from.col === selection.col &&
        candidate.to.row === row && candidate.to.col === col,
    );
    if (!move) {
      setSelection(piece?.color === room.color ? { row, col } : null);
      return;
    }
    setSelection(null);
    void sendMove(move);
  }

  async function sendMove(move: ChessMove) {
    if (!room || !playerToken) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/room/${encodeURIComponent(room.roomId)}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerToken,
          expectedVersion: room.version,
          move: moveToUci(move),
        }),
      });
      const data = await readResponse<{ state: RoomState }>(response);
      acceptRoomState(data.state);
      setStatus("Ход отправлен.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Не удалось отправить ход.");
      if (roomId && playerToken) void loadRoom(roomId, playerToken);
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!roomId) return;
    const link = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus("Ссылка скопирована.");
    } catch (cause) {
      console.error("Could not copy room link:", cause);
      setCopyStatus(link);
    }
  }

  const drawButtonLabel = room?.drawOfferedBy && room.drawOfferedBy !== room.color
    ? "🤝 Принять ничью"
    : "🤝 Предложить ничью";

  return (
    <div className="online-panel">
      <h2>🌐 Игра с другом</h2>
      <div className="online-actions">
        <button type="button" onClick={create} disabled={busy}>Создать комнату</button>
        <input
          value={joinCode}
          onChange={(event) => setJoinCode(event.target.value)}
          placeholder="Код комнаты или ссылка"
          aria-label="Код комнаты или ссылка"
        />
        <button type="button" onClick={joinFromInput} disabled={busy || !joinCode.trim()}>
          Присоединиться
        </button>
      </div>
      {room && (
        <>
          <div className="online-room-link-row">
            <input readOnly aria-label="Ссылка для приглашения" value={`${typeof window === "undefined" ? "" : window.location.origin}/?room=${room.roomId}`} />
            <button type="button" onClick={copyInvite}>Копировать ссылку</button>
            <span>Код: {room.roomId}</span>
          </div>
          <p className="online-room-status" aria-live="polite">
            {room.finished
              ? room.winner === "draw" ? "Партия завершилась вничью." : `Победили ${room.winner === "white" ? "белые" : "чёрные"}.`
              : !room.started
                ? "Ожидаем второго игрока…"
                : room.drawOfferedBy
                  ? room.drawOfferedBy === room.color ? "Вы предложили ничью." : "Соперник предлагает ничью."
                  : room.turn === room.color ? "Ваш ход." : "Ход соперника."}
          </p>
          <div className="online-player-status">
            <span>⚪ {room.players.white?.username ?? "—"}</span>
            <span>⚫ {room.players.black?.username ?? "Ожидает игрока"}</span>
          </div>
          {game && (
            <div className="board-wrapper">
              <ChessBoard
                game={game}
                legalMoves={legalMoves}
                selection={selection}
                size="medium"
                boardStyle="default"
                boardId="online-board"
                coordinatesShown
                disabled={!canPlay || busy}
                onSquareClick={clickSquare}
              />
            </div>
          )}
          {room.moves.length > 0 && <p className="online-moves">{room.moves.join(" · ")}</p>}
          {room.started && !room.finished && (
            <div className="button-row online-game-actions">
              <button onClick={() => void finish("draw")} disabled={busy || room.drawOfferedBy === room.color}>
                {drawButtonLabel}
              </button>
              <button className="danger" onClick={() => void finish("loss")} disabled={busy}>🚩 Сдаться</button>
            </div>
          )}
        </>
      )}
      <p className="online-room-status" aria-live="polite">{status}</p>
      {copyStatus && <p className="online-room-status">{copyStatus}</p>}
      {!account && <p className="online-note">Гости могут играть онлайн; для рейтинга войдите в аккаунт.</p>}
    </div>
  );
}

import { randomBytes } from "node:crypto";
import type { PieceColor } from "@/lib/chess/types";

export type RoomPlayer = {
  color: PieceColor;
  token: string;
  userId: number | null;
  username: string;
  lastSeenAt: number;
};

export type RoomMove = { coordinate: string; uci: string };

export type Room = {
  id: string;
  white: RoomPlayer;
  black: RoomPlayer | null;
  moves: RoomMove[];
  turn: PieceColor;
  fen: string;
  version: number;
  finished: boolean;
  winner: PieceColor | "draw" | null;
  drawOfferedBy: PieceColor | null;
  updatedAt: number;
  finishing: boolean;
  profiles: Record<number, { elo: number; league: string }>;
};

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const store = globalThis as typeof globalThis & { chessRooms?: Map<string, Room> };
const rooms = (store.chessRooms ??= new Map<string, Room>());

export function pruneRooms(): void {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.updatedAt > ROOM_TTL_MS) rooms.delete(id);
  }
}

export function createRoom(userId: number | null, username: string): Room {
  pruneRooms();
  if (rooms.size >= 1000) throw new Error("ROOM_CAPACITY");

  let id: string;
  do {
    id = randomBytes(6).toString("hex");
  } while (rooms.has(id));

  const room: Room = {
    id,
    white: {
      color: "white",
      token: randomBytes(24).toString("hex"),
      userId,
      username: username.trim().slice(0, 32) || "Гость",
      lastSeenAt: Date.now(),
    },
    black: null,
    moves: [],
    turn: "white",
    fen: INITIAL_FEN,
    version: 0,
    finished: false,
    winner: null,
    drawOfferedBy: null,
    updatedAt: Date.now(),
    finishing: false,
    profiles: {},
  };
  rooms.set(id, room);
  return room;
}

export function getRoom(id: string): Room | null {
  pruneRooms();
  return rooms.get(id) ?? null;
}

export function joinRoom(room: Room, userId: number | null, username: string): RoomPlayer {
  if (room.finished) throw new Error("ROOM_FINISHED");
  if (room.black) throw new Error("ROOM_FULL");

  const player: RoomPlayer = {
    color: "black",
    token: randomBytes(24).toString("hex"),
    userId,
    username: username.trim().slice(0, 32) || "Гость",
    lastSeenAt: Date.now(),
  };
  room.black = player;
  room.version += 1;
  room.updatedAt = Date.now();
  return player;
}

export function roomPlayer(room: Room, token: string): RoomPlayer | null {
  if (room.white.token === token) return room.white;
  if (room.black?.token === token) return room.black;
  return null;
}

export function roomState(room: Room, token: string) {
  const now = Date.now();
  const status = (player: RoomPlayer | null) =>
    player
      ? {
          username: player.username,
          connected: now - player.lastSeenAt < 15_000,
        }
      : null;
  const player = roomPlayer(room, token);
  if (player) player.lastSeenAt = now;
  return {
    roomId: room.id,
    color: player?.color ?? null,
    started: Boolean(room.black),
    finished: room.finished,
    winner: room.winner,
    drawOfferedBy: room.drawOfferedBy,
    version: room.version,
    turn: room.turn,
    fen: room.fen,
    moves: room.moves.map((move) => move.coordinate),
    players: { white: status(room.white), black: status(room.black) },
  };
}

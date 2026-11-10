import { stateFromFen, stateToFen } from "@/lib/chess/board";
import { moveToUci } from "@/lib/chess/moves";
import { gameOutcome, getLegalMoves, makeMove } from "@/lib/chess/rules";
import { getRoom, roomPlayer, roomState } from "@/lib/rooms";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const room = getRoom(id);
  if (!room) return Response.json({ error: "Room not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Invalid move." }, { status: 400 });
  }
  const data = body as Record<string, unknown>;
  const playerToken = typeof data.playerToken === "string" ? data.playerToken : "";
  const player = roomPlayer(room, playerToken);
  if (!player) return Response.json({ error: "Invalid room token." }, { status: 403 });
  if (!room.black || room.finished) {
    return Response.json({ error: "Room is not accepting moves." }, { status: 409 });
  }
  if (room.winner) {
    return Response.json({ error: "The game is already over." }, { status: 409 });
  }
  if (Number(data.expectedVersion) !== room.version) {
    return Response.json({ error: "Room state changed. Reload the current position." }, { status: 409 });
  }
  if (player.color !== room.turn) {
    return Response.json({ error: "It is not your turn." }, { status: 409 });
  }
  if (typeof data.move !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(data.move)) {
    return Response.json({ error: "Invalid move." }, { status: 400 });
  }

  const current = stateFromFen(room.fen);
  if (!current) return Response.json({ error: "Room position is invalid." }, { status: 500 });
  const requested = data.move.toLowerCase();
  const legal = getLegalMoves(current).find((move) => moveToUci(move) === requested);
  if (!legal) return Response.json({ error: "Illegal move." }, { status: 400 });

  const next = makeMove(current, legal);
  if (!next) return Response.json({ error: "Illegal move." }, { status: 400 });

  room.moves.push({
    coordinate: `${requested.slice(0, 2)}-${requested.slice(2, 4)}`,
    uci: requested,
  });
  room.fen = stateToFen(next);
  room.turn = next.turn;
  const outcome = gameOutcome(next);
  if (outcome) {
    room.winner =
      outcome === "checkmate" ? player.color : "draw";
  }
  room.version += 1;
  room.updatedAt = Date.now();

  return Response.json({ state: roomState(room, player.token) });
}

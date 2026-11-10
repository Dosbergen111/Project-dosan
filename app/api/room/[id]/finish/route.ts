import { getSessionFromRequest } from "@/lib/auth";
import { pool } from "@/lib/db";
import { leagueForElo } from "@/lib/elo";
import { getRoom, roomPlayer, roomState } from "@/lib/rooms";
import type { PoolClient } from "pg";

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
    return Response.json({ error: "Invalid game result." }, { status: 400 });
  }
  const data = body as Record<string, unknown>;
  const token = typeof data.playerToken === "string" ? data.playerToken : "";
  const player = roomPlayer(room, token);
  if (!player) return Response.json({ error: "Invalid room token." }, { status: 403 });
  if (!room.black) return Response.json({ error: "Waiting for the second player." }, { status: 409 });
  const session = getSessionFromRequest(request);
  if (room.finished) {
    const savedProfile = session ? room.profiles[session.userId] : undefined;
    return Response.json({
      success: true,
      state: roomState(room, token),
      profile: savedProfile && session ? { id: session.userId, ...savedProfile } : null,
    });
  }
  if (room.finishing) return Response.json({ error: "Room finish is already being processed." }, { status: 409 });
  if (data.result !== "win" && data.result !== "loss" && data.result !== "draw") {
    return Response.json({ error: "Invalid game result." }, { status: 400 });
  }

  const winner =
    data.result === "draw"
      ? "draw"
      : data.result === "win"
        ? player.color
        : player.color === "white"
          ? "black"
          : "white";
  if (room.winner && room.winner !== winner) {
    return Response.json({ error: "The reported result does not match the game." }, { status: 409 });
  }
  if (winner === "draw" && room.winner !== "draw") {
    if (room.drawOfferedBy === null) {
      room.drawOfferedBy = player.color;
      room.version += 1;
      room.updatedAt = Date.now();
      return Response.json({
        success: false,
        drawOffered: true,
        state: roomState(room, token),
      });
    }
    if (room.drawOfferedBy === player.color) {
      return Response.json({ error: "The other player must accept the draw offer." }, { status: 409 });
    }
  }
  const firstUserId = room.white.userId;
  const secondUserId = room.black.userId;
  let client: PoolClient | undefined;
  room.finishing = true;
  try {
    let profile: { id: number; elo: number; league: string } | null = null;
    if (firstUserId && secondUserId && firstUserId !== secondUserId) {
      client = await pool.connect();
      await client.query("BEGIN");
      const accounts = await client.query<{ id: number; elo: number }>(
        "SELECT id, elo FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE",
        [[firstUserId, secondUserId]],
      );
      const white = accounts.rows.find((row) => Number(row.id) === firstUserId);
      const black = accounts.rows.find((row) => Number(row.id) === secondUserId);
      if (white && black) {
        const whiteElo = Number(white.elo);
        const blackElo = Number(black.elo);
        const score = winner === "draw" ? 0.5 : winner === "white" ? 1 : 0;
        const expected = 1 / (1 + 10 ** ((blackElo - whiteElo) / 400));
        let change = Math.round(32 * (score - expected));
        if (change === 0 && score !== 0.5) change = score > expected ? 1 : -1;
        const whiteNewElo = Math.max(100, whiteElo + change);
        const blackNewElo = Math.max(100, blackElo - change);
        const whiteResult = winner === "draw" ? "draw" : winner === "white" ? "win" : "loss";
        const blackResult = winner === "draw" ? "draw" : winner === "black" ? "win" : "loss";

        await client.query(
          `INSERT INTO gamehistory (userid, result, fen, moves)
           VALUES ($1, $2, $3, $4), ($5, $6, $3, $4)`,
          [
            firstUserId,
            whiteResult,
            room.fen,
            room.moves.map((move) => move.coordinate).join(", "),
            secondUserId,
            blackResult,
          ],
        );
        await client.query(
          `UPDATE users
           SET elo = CASE id WHEN $1 THEN $2 WHEN $3 THEN $4 END,
               league = CASE id WHEN $1 THEN $5 WHEN $3 THEN $6 END
           WHERE id IN ($1, $3)`,
          [
            firstUserId,
            whiteNewElo,
            secondUserId,
            blackNewElo,
            leagueForElo(whiteNewElo),
            leagueForElo(blackNewElo),
          ],
        );
        room.profiles[firstUserId] = {
          elo: whiteNewElo,
          league: leagueForElo(whiteNewElo),
        };
        room.profiles[secondUserId] = {
          elo: blackNewElo,
          league: leagueForElo(blackNewElo),
        };
        const accountProfile = session ? room.profiles[session.userId] : undefined;
        if (accountProfile && session) profile = { id: session.userId, ...accountProfile };
      }
      await client.query("COMMIT");
    }

    room.finished = true;
    room.finishing = false;
    room.winner = winner;
    room.version += 1;
    room.updatedAt = Date.now();
    return Response.json({ success: true, state: roomState(room, token), profile });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Room finish rollback failed:", rollbackError);
      }
    }
    console.error("Room finish error:", error);
    return Response.json({ error: "Room could not be finished." }, { status: 500 });
  } finally {
    room.finishing = false;
    client?.release();
  }
}

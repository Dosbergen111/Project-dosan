import { getSessionFromRequest } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getRoom, joinRoom, roomState } from "@/lib/rooms";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const room = getRoom(id);
  if (!room) return Response.json({ error: "Room not found." }, { status: 404 });

  const session = getSessionFromRequest(request);
  let username = "Гость";
  if (session) {
    try {
      const result = await pool.query(
        "SELECT username, is_blocked FROM users WHERE id = $1",
        [session.userId],
      );
      const user = result.rows[0] as
        | { username: string; is_blocked: boolean }
        | undefined;
      if (!user || user.is_blocked) {
        return Response.json({ error: "Account is unavailable." }, { status: 403 });
      }
      username = user.username;
    } catch (error) {
      console.error("Room player lookup error:", error);
      return Response.json({ error: "Could not join room." }, { status: 500 });
    }
  }

  try {
    const player = joinRoom(room, session?.userId ?? null, username);
    return Response.json({
      roomId: room.id,
      playerToken: player.token,
      color: player.color,
      state: roomState(room, player.token),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ROOM_FINISHED") {
      return Response.json({ error: "Room is already finished." }, { status: 410 });
    }
    if (message === "ROOM_FULL") {
      return Response.json({ error: "Room already has two players." }, { status: 409 });
    }
    console.error("Room join error:", error);
    return Response.json({ error: "Could not join room." }, { status: 500 });
  }
}

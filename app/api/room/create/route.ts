import { getSessionFromRequest } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createRoom, roomState } from "@/lib/rooms";

export async function POST(request: Request) {
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
      console.error("Room creator lookup error:", error);
      return Response.json({ error: "Could not create room." }, { status: 500 });
    }
  }

  try {
    const room = createRoom(session?.userId ?? null, username);
    return Response.json(
      {
        roomId: room.id,
        playerToken: room.white.token,
        color: "white",
        joinUrl: `/?room=${encodeURIComponent(room.id)}`,
        state: roomState(room, room.white.token),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "ROOM_CAPACITY") {
      return Response.json({ error: "Room capacity reached." }, { status: 503 });
    }
    console.error("Room create error:", error);
    return Response.json({ error: "Could not create room." }, { status: 500 });
  }
}

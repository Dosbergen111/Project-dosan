import { getSessionFromRequest } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function POST(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: "Sign in to send chat messages." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("message" in body) ||
    !("userId" in body) ||
    !("username" in body)
  ) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }
  const { message, userId } = body;
  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 500 ||
    Number(userId) !== session.userId
  ) {
    return Response.json({ error: "Message must be 1–500 characters." }, { status: 400 });
  }

  try {
    const userResult = await pool.query(
      "SELECT username, is_blocked FROM users WHERE id = $1",
      [session.userId],
    );
    const user = userResult.rows[0] as
      | { username: string; is_blocked: boolean }
      | undefined;
    if (!user || user.is_blocked) {
      return Response.json({ error: "Account is unavailable." }, { status: 403 });
    }

    await pool.query(
      "INSERT INTO globalchat (userid, username, message) VALUES ($1, $2, $3)",
      [session.userId, user.username, message.trim()],
    );
    return Response.json({ success: true });
  } catch (error) {
    console.error("Chat send error:", error);
    return Response.json({ error: "Could not send message." }, { status: 500 });
  }
}

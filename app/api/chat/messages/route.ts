import { pool } from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, userid AS "userId", username, message, sentat AS "sentAt"
       FROM globalchat ORDER BY sentat DESC LIMIT 50`,
    );
    return Response.json({ messages: result.rows.reverse() });
  } catch (error) {
    console.error("Chat messages error:", error);
    return Response.json({ error: "Could not load messages." }, { status: 500 });
  }
}

import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sign-in required to view game history." }, { status: 401 });
  }

  try {
    const result = await pool.query(
      `SELECT id, result, fen, moves, created_at AS "createdAt"
       FROM gamehistory WHERE userid = $1 ORDER BY created_at DESC LIMIT 100`,
      [session.userId],
    );
    return Response.json({ games: result.rows });
  } catch (error) {
    console.error("History load error:", error);
    return Response.json({ error: "History unavailable." }, { status: 500 });
  }
}

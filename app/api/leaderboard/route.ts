import { pool } from "@/lib/db";

export async function GET(request: Request) {
  const userIdValue = new URL(request.url).searchParams.get("userId");
  const userId = userIdValue === null ? null : Number(userIdValue);
  if (userId !== null && (!Number.isSafeInteger(userId) || userId < 1)) {
    return Response.json({ error: "Invalid user." }, { status: 400 });
  }

  try {
    const leaderboard = await pool.query(
      `SELECT username, elo, league, is_premium,
              RANK() OVER (ORDER BY elo DESC) AS rank
       FROM users ORDER BY elo DESC, id ASC LIMIT 10`,
    );
    let userRank = null;
    if (userId !== null) {
      const rankResult = await pool.query(
        `SELECT position AS rank, username, elo, league
         FROM (
           SELECT id, username, elo, league, RANK() OVER (ORDER BY elo DESC) AS position
           FROM users
         ) AS ranked
         WHERE id = $1`,
        [userId],
      );
      userRank = rankResult.rows[0] ?? null;
    }

    return Response.json({ leaderboard: leaderboard.rows, userRank });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return Response.json({ error: "Failed to fetch leaderboard." }, { status: 500 });
  }
}

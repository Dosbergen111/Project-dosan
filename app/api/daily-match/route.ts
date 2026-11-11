import { getSessionFromRequest } from "@/lib/auth";
import { ensureDailyMatchesTable } from "@/lib/daily-match";
import { pool } from "@/lib/db";

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: "Войдите, чтобы участвовать в дневном матче." }, { status: 401 });
  }

  try {
    await ensureDailyMatchesTable();
    const result = await pool.query(
      `SELECT TO_CHAR(match_date, 'YYYY-MM-DD') AS date, result, elo, elo_change AS "eloChange", league
       FROM daily_matches
       WHERE user_id = $1 AND match_date = (NOW() AT TIME ZONE 'UTC')::date`,
      [session.userId],
    );
    return Response.json({ match: result.rows[0] ?? null });
  } catch (error) {
    console.error("Daily match lookup failed:", error);
    return Response.json({ error: "Не удалось загрузить дневной матч." }, { status: 500 });
  }
}

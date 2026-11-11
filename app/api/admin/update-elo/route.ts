import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { leagueForElo } from "@/lib/elo";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Invalid user or Elo." }, { status: 400 });
  }
  const { id, elo } = body as Record<string, unknown>;
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 ||
      !Number.isInteger(elo) || Number(elo) < 100 || Number(elo) > 3000) {
    return Response.json({ error: "Enter an Elo from 100 to 3000." }, { status: 400 });
  }
  try {
    const result = await pool.query(
      "UPDATE users SET elo = $1, league = $2 WHERE id = $3 RETURNING id, username, elo, league",
      [elo, leagueForElo(Number(elo)), Number(id)],
    );
    if (!result.rows[0]) return Response.json({ error: "User not found." }, { status: 404 });
    return Response.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error("Admin Elo update error:", error);
    return Response.json({ error: "Could not update Elo." }, { status: 500 });
  }
}

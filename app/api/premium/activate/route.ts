import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { leagueForElo } from "@/lib/elo";
import { regenerateEnergy } from "@/lib/energy";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Войдите, чтобы активировать Premium." }, { status: 401 });
  }

  try {
    await regenerateEnergy(session.userId);
    const result = await pool.query(
      `UPDATE users SET is_premium = TRUE
       WHERE id = $1
       RETURNING id, username, elo, energy, role, is_premium`,
      [session.userId],
    );
    const account = result.rows[0] as
      | {
          id: number;
          username: string;
          elo: number;
          energy: number;
          role: string;
          is_premium: boolean;
        }
      | undefined;

    if (!account) {
      return Response.json({ error: "Профиль не найден." }, { status: 404 });
    }

    return Response.json({ ...account, league: leagueForElo(account.elo) });
  } catch (error) {
    console.error("Premium activation failed:", error);
    return Response.json({ error: "Не удалось активировать Premium." }, { status: 500 });
  }
}

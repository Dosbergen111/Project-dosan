import { getSessionFromRequest } from "@/lib/auth";
import { pool } from "@/lib/db";
import { leagueForElo } from "@/lib/elo";
import { regenerateEnergy } from "@/lib/energy";

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: "Sign-in required to view profile." }, { status: 401 });
  }
  const userIdValue = new URL(request.url).searchParams.get("userId");
  const userId = Number(userIdValue);

  if (!Number.isSafeInteger(userId) || userId < 1) {
    return Response.json({ error: "Invalid user." }, { status: 400 });
  }
  if (userId !== session.userId) {
    return Response.json({ error: "Cannot view another user's profile." }, { status: 403 });
  }

  try {
    await regenerateEnergy(userId);
    const result = await pool.query(
      `SELECT id, username, elo, energy, role, is_premium, is_blocked, last_energy_update,
              (SELECT COUNT(*) + 1 FROM users AS ranked
               WHERE ranked.elo > profile.elo) AS rank
       FROM users AS profile
       WHERE id = $1`,
      [userId],
    );
    const user = result.rows[0] as
      | {
          id: number;
          username: string;
          elo: number;
          energy: number;
          role: string;
          is_premium: boolean;
          is_blocked: boolean;
          last_energy_update: Date;
          rank: string;
        }
      | undefined;

    if (!user) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }
    if (user.is_blocked) {
      return Response.json({ error: "This account has been blocked." }, { status: 403 });
    }

    return Response.json({
      ...user,
      league: leagueForElo(user.elo),
    });
  } catch (error) {
    console.error("Profile error:", error);
    return Response.json({ error: "Profile unavailable." }, { status: 500 });
  }
}

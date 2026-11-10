import bcrypt from "bcryptjs";
import { createSessionToken } from "@/lib/auth";
import { pool } from "@/lib/db";
import { leagueForElo } from "@/lib/elo";
import { regenerateEnergy } from "@/lib/energy";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("username" in body) ||
    !("password" in body) ||
    typeof body.username !== "string" ||
    typeof body.password !== "string" ||
    body.username.trim().length === 0 ||
    body.password.length === 0
  ) {
    return Response.json(
      { error: "Username and password are required." },
      { status: 400 },
    );
  }

  try {
    const result = await pool.query(
      `SELECT id, username, password_hash, elo, role, is_blocked, is_premium
       FROM users WHERE username = $1`,
      [body.username.trim()],
    );
    const user = result.rows[0] as
      | {
          id: number;
          username: string;
          password_hash: string;
          elo: number;
          role: string;
          is_blocked: boolean;
          is_premium: boolean;
        }
      | undefined;

    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      return Response.json({ error: "Invalid username or password." }, { status: 401 });
    }
    if (user.is_blocked) {
      return Response.json({ error: "This account has been blocked." }, { status: 403 });
    }

    await regenerateEnergy(user.id);
    const energyResult = await pool.query(
      "SELECT energy FROM users WHERE id = $1",
      [user.id],
    );

    return Response.json({
      id: user.id,
      username: user.username,
      elo: user.elo,
      energy: energyResult.rows[0].energy,
      role: user.role,
      is_premium: user.is_premium,
      league: leagueForElo(user.elo),
      sessionToken: createSessionToken(user.id),
    });
  } catch (error) {
    console.error("Login error:", error);
    return Response.json({ error: "Login failed." }, { status: 500 });
  }
}

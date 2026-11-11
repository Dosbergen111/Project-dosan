import { getSessionFromRequest } from "@/lib/auth";
import { ensureDailyMatchesTable } from "@/lib/daily-match";
import { pool } from "@/lib/db";
import { leagueForElo } from "@/lib/elo";
import type { PoolClient, QueryResultRow } from "pg";

function botEloForDifficulty(level: number): number | null {
  if (!Number.isInteger(level) || level < 1 || level > 20) return null;
  if (level <= 2) return 800;
  if (level <= 5) return 1200;
  if (level <= 10) return 1600;
  return 2000;
}

export async function POST(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: "Sign-in required to save a game." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Invalid game data." }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const result = data.result;
  const fen = data.fen;
  const moves = data.moves;
  const gameMode = data.gameMode === "pvp" ? "pvp" : data.gameMode === "pvc" ? "pvc" : null;
  const difficulty = Number(data.difficulty);
  const dailyMatch = data.dailyMatch === true;
  const botElo = gameMode === "pvc" ? botEloForDifficulty(difficulty) : null;

  if (
    (result !== "win" && result !== "loss" && result !== "draw") ||
    typeof fen !== "string" ||
    fen.length > 256 ||
    typeof moves !== "string" ||
    moves.length > 20_000 ||
    gameMode === null ||
    (gameMode === "pvc" && botElo === null) ||
    (data.dailyMatch !== undefined && typeof data.dailyMatch !== "boolean") ||
    (dailyMatch && (gameMode !== "pvc" || difficulty !== 5))
  ) {
    return Response.json({ error: "Invalid game data or bot difficulty." }, { status: 400 });
  }

  let client: PoolClient | undefined;
  try {
    if (dailyMatch) await ensureDailyMatchesTable();
    client = await pool.connect();
    await client.query("BEGIN");
    const accountResult = await client.query<QueryResultRow>(
      "SELECT elo FROM users WHERE id = $1 FOR UPDATE",
      [session.userId],
    );
    if (accountResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return Response.json({ error: "User not found." }, { status: 404 });
    }
    if (dailyMatch) {
      const previousMatch = await client.query(
        `SELECT 1 FROM daily_matches
         WHERE user_id = $1 AND match_date = (NOW() AT TIME ZONE 'UTC')::date`,
        [session.userId],
      );
      if (previousMatch.rows.length) {
        await client.query("ROLLBACK");
        return Response.json({ error: "Дневной матч уже сыгран сегодня." }, { status: 409 });
      }
    }

    const oldElo = Number(accountResult.rows[0].elo);
    if (!Number.isFinite(oldElo)) throw new Error("Stored player Elo is not numeric.");
    const actualScore = result === "win" ? 1 : result === "draw" ? 0.5 : 0;
    const opponentElo = botElo ?? oldElo;
    const expectedScore = 1 / (1 + 10 ** ((opponentElo - oldElo) / 400));
    let eloChange = Math.round(32 * (actualScore - expectedScore));
    if (eloChange === 0 && result !== "draw" && actualScore !== expectedScore) {
      eloChange = actualScore > expectedScore ? 1 : -1;
    }
    const newElo = Math.max(100, Math.round(oldElo + eloChange));
    eloChange = newElo - oldElo;
    const league = leagueForElo(newElo);

    const savedGame = await client.query(
      "INSERT INTO gamehistory (userid, result, fen, moves) VALUES ($1, $2, $3, $4) RETURNING id",
      [session.userId, result, fen, moves],
    );
    await client.query("UPDATE users SET elo = $1, league = $2 WHERE id = $3", [
      newElo,
      league,
      session.userId,
    ]);
    if (dailyMatch) {
      await client.query(
        `INSERT INTO daily_matches (user_id, match_date, result, elo, elo_change, league)
         VALUES ($1, (NOW() AT TIME ZONE 'UTC')::date, $2, $3, $4, $5)`,
        [session.userId, result, newElo, eloChange, league],
      );
    }
    await client.query("COMMIT");

    return Response.json({
      success: true,
      gameId: savedGame.rows[0].id,
      elo: newElo,
      eloChange,
      league,
      ...(dailyMatch
        ? {
            dailyMatch: {
              date: new Date().toISOString().slice(0, 10),
              result,
              elo: newElo,
              eloChange,
              league,
            },
          }
        : {}),
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Game save rollback failed:", rollbackError);
      }
    }
    console.error("Game save error:", error);
    return Response.json({ error: "Game could not be saved." }, { status: 500 });
  } finally {
    client?.release();
  }
}

import { randomBytes } from "node:crypto";
import { pool } from "@/lib/db";

type Session = {
  userId: number;
  expiresAt: number;
};

const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sessionTokenFromRequest(request: Request): string | null {
  const match = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+([a-f0-9]{64})$/i);

  return match?.[1].toLowerCase() ?? null;
}

export function createSessionToken(userId: number): string {
  const now = Date.now();

  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }

  const token = randomBytes(32).toString("hex");
  sessions.set(token, { userId, expiresAt: now + SESSION_TTL_MS });
  return token;
}

export function getSessionFromRequest(request: Request): Session | null {
  const token = sessionTokenFromRequest(request);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return session;
}

export function deleteSessionFromRequest(request: Request): void {
  const token = sessionTokenFromRequest(request);
  if (token) sessions.delete(token);
}

export async function requireAdmin(request: Request): Promise<Session | Response> {
  const session = getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: "Administrator sign-in required." }, { status: 401 });
  }

  try {
    const result = await pool.query(
      "SELECT role, is_blocked FROM users WHERE id = $1",
      [session.userId],
    );
    const account = result.rows[0] as
      | { role: string; is_blocked: boolean }
      | undefined;

    if (!account || account.role !== "admin" || account.is_blocked) {
      deleteSessionFromRequest(request);
      return Response.json({ error: "Administrator access denied." }, { status: 403 });
    }

    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return session;
  } catch (error) {
    console.error("Admin authorization error:", error);
    return Response.json({ error: "Authorization unavailable." }, { status: 500 });
  }
}

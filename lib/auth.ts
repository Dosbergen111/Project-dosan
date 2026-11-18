import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { pool } from "@/lib/db";

type Session = {
  userId: number;
  expiresAt: number;
};

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_COOKIE_NAME = "session";

export class SessionConfigurationError extends Error {
  constructor() {
    super("SESSION_SECRET is not configured.");
    this.name = "SessionConfigurationError";
  }
}

function sessionSecret(): Uint8Array {
  if (!process.env.SESSION_SECRET) throw new SessionConfigurationError();
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

export async function createSessionToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionSecret());
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    const userId = Number(payload.sub);
    const expiresAt = typeof payload.exp === "number" ? payload.exp * 1000 : 0;
    if (!Number.isSafeInteger(userId) || userId < 1 || expiresAt <= Date.now()) return null;
    return { userId, expiresAt };
  } catch (error) {
    if (error instanceof SessionConfigurationError) throw error;
    return null;
  }
}

export async function requireAdmin(): Promise<Session | Response> {
  let session: Session | null;
  try {
    session = await getSession();
  } catch (error) {
    if (error instanceof SessionConfigurationError) {
      return Response.json({ error: "Server session configuration error: SESSION_SECRET is not configured." }, { status: 500 });
    }
    throw error;
  }
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
      return Response.json({ error: "Administrator access denied." }, { status: 403 });
    }

    return session;
  } catch (error) {
    console.error("Admin authorization error:", error);
    return Response.json({ error: "Authorization unavailable." }, { status: 500 });
  }
}

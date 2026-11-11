import { createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "@/lib/db";

type Session = {
  userId: number;
  expiresAt: number;
};

export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
export const SESSION_COOKIE_NAME = "session";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? process.env.DATABASE_URL;
  if (!secret) throw new Error("SESSION_SECRET or DATABASE_URL must be configured.");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function sessionTokenFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return bearer;

  const cookie = request.headers.get("cookie");
  const value = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
  return value || null;
}

export function createSessionToken(userId: number): string {
  const payload = Buffer.from(
    `${userId}.${Date.now() + SESSION_TTL_MS}`,
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function getSessionFromRequest(request: Request): Session | null {
  const token = sessionTokenFromRequest(request);
  if (!token) return null;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  let validSignature: string;
  try {
    validSignature = sign(payload);
  } catch (error) {
    console.error("Session verification is unavailable:", error);
    return null;
  }
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(validSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString();
  } catch {
    return null;
  }
  const match = decoded.match(/^([1-9]\d*)\.(\d+)$/);
  if (!match) return null;

  const userId = Number(match[1]);
  const expiresAt = Number(match[2]);
  if (
    !Number.isSafeInteger(userId) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Date.now()
  ) return null;

  return { userId, expiresAt };
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
      return Response.json({ error: "Administrator access denied." }, { status: 403 });
    }

    return session;
  } catch (error) {
    console.error("Admin authorization error:", error);
    return Response.json({ error: "Authorization unavailable." }, { status: 500 });
  }
}

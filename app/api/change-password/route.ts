import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function POST(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("userId" in body) ||
    !("oldPassword" in body) ||
    !("newPassword" in body) ||
    typeof body.userId !== "number" ||
    !Number.isSafeInteger(body.userId) ||
    body.userId < 1 ||
    typeof body.oldPassword !== "string" ||
    !body.oldPassword ||
    typeof body.newPassword !== "string" ||
    !body.newPassword
  ) {
    return NextResponse.json({ error: "Invalid password change data." }, { status: 400 });
  }
  if (body.userId !== session.userId) {
    return NextResponse.json({ error: "Cannot change another user's password." }, { status: 403 });
  }

  try {
    const result = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [session.userId],
    );
    const user = result.rows[0] as { password_hash: string } | undefined;
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (!(await bcrypt.compare(body.oldPassword, user.password_hash))) {
      return NextResponse.json({ error: "Incorrect current password." }, { status: 401 });
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      session.userId,
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Password change failed:", error);
    return NextResponse.json({ error: "Could not change password." }, { status: 500 });
  }
}

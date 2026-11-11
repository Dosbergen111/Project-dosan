import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

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
    return Response.json({ error: "Invalid premium status." }, { status: 400 });
  }
  const { id, premiumStatus } = body as Record<string, unknown>;
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId < 1 || typeof premiumStatus !== "boolean") {
    return Response.json({ error: "Invalid premium status." }, { status: 400 });
  }
  try {
    const result = await pool.query(
      "UPDATE users SET is_premium = $1 WHERE id = $2 RETURNING id",
      [premiumStatus, userId],
    );
    if (!result.rows[0]) return Response.json({ error: "User not found." }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Admin premium update error:", error);
    return Response.json({ error: "Could not update premium status." }, { status: 500 });
  }
}

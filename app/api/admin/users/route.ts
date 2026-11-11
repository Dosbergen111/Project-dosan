import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  try {
    const result = await pool.query(
      `SELECT id, username, elo, energy, role, is_blocked, is_premium
       FROM users ORDER BY id ASC`,
    );
    return Response.json({ users: result.rows });
  } catch (error) {
    console.error("Admin users error:", error);
    return Response.json({ error: "Could not load users." }, { status: 500 });
  }
}

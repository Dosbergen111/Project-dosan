import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !("username" in body) || !("password" in body)) {
    return Response.json(
      { error: "Username and password are required." },
      { status: 400 },
    );
  }

  const { username, password } = body;
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.trim().length === 0 ||
    username.trim().length > 50 ||
    password.length === 0
  ) {
    return Response.json(
      { error: "Username and password are required; username must be at most 50 characters." },
      { status: 400 },
    );
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
      [username.trim(), passwordHash],
    );

    return Response.json(
      { message: "User registered successfully.", userId: result.rows[0].id },
      { status: 201 },
    );
  } catch (error) {
    if (errorCode(error) === "23505") {
      return Response.json({ error: "Username already exists." }, { status: 409 });
    }

    console.error("Registration error:", error);
    return Response.json({ error: "Registration failed." }, { status: 500 });
  }
}

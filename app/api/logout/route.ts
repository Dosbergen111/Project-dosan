import { deleteSessionFromRequest } from "@/lib/auth";

export async function POST(request: Request) {
  deleteSessionFromRequest(request);
  return Response.json({ success: true });
}

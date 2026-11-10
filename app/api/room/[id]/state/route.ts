import { getRoom, roomPlayer, roomState } from "@/lib/rooms";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const room = getRoom(id);
  if (!room) return Response.json({ error: "Room not found." }, { status: 404 });

  const token = new URL(request.url).searchParams.get("token") ?? "";
  const player = roomPlayer(room, token);
  if (!player) return Response.json({ error: "Invalid room token." }, { status: 403 });

  return Response.json({ state: roomState(room, player.token) });
}

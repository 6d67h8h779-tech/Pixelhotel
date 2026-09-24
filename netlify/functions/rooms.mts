import type { Config } from "@netlify/functions";
import {
  roomsStore,
  codesStore,
  userRoomsStore,
  usersStore,
  getUserFromRequest,
  newId,
  newCode,
  json,
  err,
} from "./_lib/util.mts";

async function addRoomToUser(username: string, roomId: string) {
  const store = userRoomsStore();
  const list: string[] = (await store.get(username, { type: "json" })) || [];
  if (!list.includes(roomId)) {
    list.push(roomId);
    await store.setJSON(username, list);
  }
}

export default async (req: Request) => {
  const username = await getUserFromRequest(req);
  if (!username) return err("Nicht eingeloggt", 401);
  if (req.method !== "POST") return err("Method not allowed", 405);

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON");
  const { action } = body as { action?: string };

  const rooms = roomsStore();
  const codes = codesStore();

  if (action === "create") {
    const { name } = body as { name?: string };
    if (!name || !name.trim()) return err("Gruppenname erforderlich");

    let code = newCode();
    // avoid extremely unlikely collision
    for (let i = 0; i < 5; i++) {
      const existing = await codes.get(code);
      if (!existing) break;
      code = newCode();
    }

    const roomId = newId();
    const room = {
      roomId,
      isGroup: true,
      name: name.trim().slice(0, 40),
      code,
      members: [username],
      createdAt: Date.now(),
    };
    await rooms.setJSON(roomId, room);
    await codes.set(code, roomId);
    await addRoomToUser(username, roomId);

    return json({ room: { roomId, name: room.name, code, isGroup: true } });
  }

  if (action === "join") {
    const { code } = body as { code?: string };
    if (!code) return err("Code erforderlich");
    const roomId = await codes.get(code.toUpperCase().trim());
    if (!roomId) return err("Ungültiger Code", 404);
    const room = await rooms.get(roomId, { type: "json" });
    if (!room) return err("Gruppe nicht gefunden", 404);

    if (!room.members.includes(username)) {
      room.members.push(username);
      await rooms.setJSON(roomId, room);
    }
    await addRoomToUser(username, roomId);

    return json({ room: { roomId: room.roomId, name: room.name, code: room.code, isGroup: true } });
  }

  return err("Unbekannte Aktion");
};

export const config: Config = {
  path: "/api/rooms",
};

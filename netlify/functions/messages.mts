import type { Config } from "@netlify/functions";
import {
  roomsStore,
  messagesStore,
  usersStore,
  getUserFromRequest,
  newId,
  json,
  err,
} from "./_lib/util.mts";

const ALLOWED_TYPES = new Set(["text", "sticker", "image", "gif", "file"]);
const MAX_MESSAGES_RETURNED = 500;

export default async (req: Request) => {
  const username = await getUserFromRequest(req);
  if (!username) return err("Nicht eingeloggt", 401);

  const url = new URL(req.url);

  if (req.method === "GET") {
    const roomId = url.searchParams.get("roomId");
    const since = Number(url.searchParams.get("since") || "0");
    if (!roomId) return err("roomId erforderlich");

    const room = await roomsStore().get(roomId, { type: "json" });
    if (!room || !room.members.includes(username)) return err("Kein Zugriff auf diesen Raum", 403);

    const all: any[] = (await messagesStore().get(roomId, { type: "json" })) || [];
    const filtered = all.filter((m) => m.createdAt > since).slice(-MAX_MESSAGES_RETURNED);
    return json({ messages: filtered });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body) return err("Invalid JSON");
    const { roomId, type, content, fileId, fileName, mimeType } = body as {
      roomId?: string;
      type?: string;
      content?: string;
      fileId?: string;
      fileName?: string;
      mimeType?: string;
    };
    if (!roomId || !type || !ALLOWED_TYPES.has(type)) return err("Ungültige Nachricht");
    if (type === "text" && (!content || !content.trim())) return err("Leere Nachricht");
    if (type === "text" && content!.length > 4000) return err("Nachricht zu lang");
    if ((type === "image" || type === "gif" || type === "file") && !fileId) {
      return err("fileId erforderlich");
    }

    const room = await roomsStore().get(roomId, { type: "json" });
    if (!room || !room.members.includes(username)) return err("Kein Zugriff auf diesen Raum", 403);

    const sender = await usersStore().get(username, { type: "json" });

    const message = {
      id: newId(),
      roomId,
      sender: username,
      senderName: sender?.displayName || username,
      senderAvatar: sender?.avatarFileId || null,
      type,
      content: content ? content.trim().slice(0, 4000) : null,
      fileId: fileId || null,
      fileName: fileName || null,
      mimeType: mimeType || null,
      createdAt: Date.now(),
    };

    const store = messagesStore();
    const all: any[] = (await store.get(roomId, { type: "json" })) || [];
    all.push(message);
    // cap history to last 2000 messages per room to keep blob small
    const trimmed = all.length > 2000 ? all.slice(-2000) : all;
    await store.setJSON(roomId, trimmed);

    return json({ message });
  }

  return err("Method not allowed", 405);
};

export const config: Config = {
  path: "/api/messages",
};

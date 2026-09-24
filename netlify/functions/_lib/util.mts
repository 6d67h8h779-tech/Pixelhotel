import { getStore } from "@netlify/blobs";
import { scryptSync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function usersStore() {
  return getStore({ name: "users", consistency: "strong" });
}
export function sessionsStore() {
  return getStore({ name: "sessions", consistency: "strong" });
}
export function roomsStore() {
  return getStore({ name: "rooms", consistency: "strong" });
}
export function codesStore() {
  return getStore({ name: "codes", consistency: "strong" });
}
export function messagesStore() {
  return getStore({ name: "messages", consistency: "strong" });
}
export function userRoomsStore() {
  return getStore({ name: "user-rooms", consistency: "strong" });
}
export function uploadsStore() {
  return getStore({ name: "uploads" });
}
export function uploadsMetaStore() {
  return getStore({ name: "uploads-meta", consistency: "strong" });
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = scryptSync(password, salt, 64);
  const original = Buffer.from(hash, "hex");
  if (check.length !== original.length) return false;
  return timingSafeEqual(check, original);
}

export function newId(): string {
  return randomUUID();
}

export function newCode(): string {
  // 6 chars, easy to read/type (no 0/O/1/I)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
export function validUsername(u: string): boolean {
  return typeof u === "string" && USERNAME_RE.test(u);
}

export async function getUserFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const session = await sessionsStore().get(token, { type: "json" });
  if (!session) return null;
  return session.username as string;
}

export function dmRoomId(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `dm__${x}__${y}`;
}

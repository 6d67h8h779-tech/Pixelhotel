import type { Config } from "@netlify/functions";
import { usersStore, sessionsStore, verifyPassword, newToken, json, err } from "./_lib/util.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return err("Method not allowed", 405);
  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON");
  const { username, password } = body as { username?: string; password?: string };
  if (!username || !password) return err("Nutzername und Passwort erforderlich");

  const key = username.toLowerCase();
  const user = await usersStore().get(key, { type: "json" });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return err("Nutzername oder Passwort falsch", 401);
  }

  const token = newToken();
  await sessionsStore().setJSON(token, { username: key, createdAt: Date.now() });

  return json({
    token,
    user: { username: user.username, displayName: user.displayName, avatarFileId: user.avatarFileId },
  });
};

export const config: Config = {
  path: "/api/login",
};

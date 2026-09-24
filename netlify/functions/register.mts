import type { Config } from "@netlify/functions";
import {
  usersStore,
  sessionsStore,
  hashPassword,
  newToken,
  validUsername,
  json,
  err,
} from "./_lib/util.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return err("Method not allowed", 405);
  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON");
  const { username, password, displayName } = body as {
    username?: string;
    password?: string;
    displayName?: string;
  };

  if (!validUsername(username || "")) {
    return err("Nutzername muss 3-20 Zeichen sein (Buchstaben, Zahlen, _)");
  }
  if (!password || password.length < 6) {
    return err("Passwort muss mindestens 6 Zeichen haben");
  }

  const store = usersStore();
  const key = username!.toLowerCase();
  const existing = await store.get(key, { type: "json" });
  if (existing) return err("Nutzername ist bereits vergeben", 409);

  const user = {
    username: username,
    displayName: displayName?.trim() || username,
    passwordHash: hashPassword(password),
    avatarFileId: null as string | null,
    friends: [] as string[],
    createdAt: Date.now(),
  };
  await store.setJSON(key, user);

  const token = newToken();
  await sessionsStore().setJSON(token, { username: key, createdAt: Date.now() });

  return json({
    token,
    user: { username: user.username, displayName: user.displayName, avatarFileId: user.avatarFileId },
  });
};

export const config: Config = {
  path: "/api/register",
};

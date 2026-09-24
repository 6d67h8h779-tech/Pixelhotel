import type { Config } from "@netlify/functions";
import { usersStore, getUserFromRequest, json, err } from "./_lib/util.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return err("Method not allowed", 405);
  const username = await getUserFromRequest(req);
  if (!username) return err("Nicht eingeloggt", 401);

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON");
  const { displayName, avatarFileId } = body as { displayName?: string; avatarFileId?: string };

  const store = usersStore();
  const user = await store.get(username, { type: "json" });
  if (!user) return err("Nutzer nicht gefunden", 404);

  if (typeof displayName === "string" && displayName.trim()) {
    user.displayName = displayName.trim().slice(0, 40);
  }
  if (typeof avatarFileId === "string") {
    user.avatarFileId = avatarFileId;
  }
  await store.setJSON(username, user);

  return json({
    user: { username: user.username, displayName: user.displayName, avatarFileId: user.avatarFileId },
  });
};

export const config: Config = {
  path: "/api/profile",
};

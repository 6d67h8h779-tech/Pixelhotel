import type { Config } from "@netlify/functions";
import {
  usersStore,
  roomsStore,
  userRoomsStore,
  getUserFromRequest,
  json,
  err,
} from "./_lib/util.mts";

export default async (req: Request) => {
  const username = await getUserFromRequest(req);
  if (!username) return err("Nicht eingeloggt", 401);

  const user = await usersStore().get(username, { type: "json" });
  if (!user) return err("Nutzer nicht gefunden", 404);

  const friendUsernames: string[] = user.friends || [];
  const friends = [];
  for (const fu of friendUsernames) {
    const f = await usersStore().get(fu, { type: "json" });
    if (f) {
      friends.push({
        username: f.username,
        displayName: f.displayName,
        avatarFileId: f.avatarFileId,
      });
    }
  }

  const roomIds: string[] = (await userRoomsStore().get(username, { type: "json" })) || [];
  const rooms = [];
  for (const rid of roomIds) {
    const room = await roomsStore().get(rid, { type: "json" });
    if (!room) continue;
    let name = room.name;
    let avatarFileId = null;
    if (!room.isGroup) {
      const otherUsername = room.members.find((m: string) => m !== username);
      const other = otherUsername ? await usersStore().get(otherUsername, { type: "json" }) : null;
      name = other ? other.displayName : "Unbekannt";
      avatarFileId = other ? other.avatarFileId : null;
    }
    rooms.push({
      roomId: room.roomId,
      name,
      isGroup: room.isGroup,
      code: room.isGroup ? room.code : undefined,
      avatarFileId,
      memberCount: room.members.length,
    });
  }

  return json({
    user: {
      username: user.username,
      displayName: user.displayName,
      avatarFileId: user.avatarFileId,
    },
    friends,
    rooms,
  });
};

export const config: Config = {
  path: "/api/me",
};

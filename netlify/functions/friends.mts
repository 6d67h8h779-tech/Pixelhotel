import type { Config } from "@netlify/functions";
import {
  usersStore,
  roomsStore,
  userRoomsStore,
  getUserFromRequest,
  dmRoomId,
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
  const friendUsernameRaw = (body as { username?: string }).username;
  if (!friendUsernameRaw) return err("Nutzername erforderlich");
  const friendUsername = friendUsernameRaw.toLowerCase();

  if (friendUsername === username) return err("Du kannst dich nicht selbst hinzufügen");

  const users = usersStore();
  const me = await users.get(username, { type: "json" });
  const friend = await users.get(friendUsername, { type: "json" });
  if (!friend) return err("Nutzer nicht gefunden", 404);

  if (!me.friends.includes(friendUsername)) me.friends.push(friendUsername);
  if (!friend.friends.includes(username)) friend.friends.push(username);
  await users.setJSON(username, me);
  await users.setJSON(friendUsername, friend);

  const roomId = dmRoomId(username, friendUsername);
  const rooms = roomsStore();
  let room = await rooms.get(roomId, { type: "json" });
  if (!room) {
    room = {
      roomId,
      isGroup: false,
      name: null,
      members: [username, friendUsername],
      createdAt: Date.now(),
    };
    await rooms.setJSON(roomId, room);
  }
  await addRoomToUser(username, roomId);
  await addRoomToUser(friendUsername, roomId);

  return json({
    friend: { username: friend.username, displayName: friend.displayName, avatarFileId: friend.avatarFileId },
    roomId,
  });
};

export const config: Config = {
  path: "/api/friends",
};

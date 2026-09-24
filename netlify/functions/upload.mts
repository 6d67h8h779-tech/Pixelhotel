import type { Config } from "@netlify/functions";
import { uploadsStore, uploadsMetaStore, getUserFromRequest, newId, json, err } from "./_lib/util.mts";

const MAX_BYTES = 4.5 * 1024 * 1024; // ~4.5MB raw (base64 payload will be larger)

export default async (req: Request) => {
  const username = await getUserFromRequest(req);
  if (!username) return err("Nicht eingeloggt", 401);
  if (req.method !== "POST") return err("Method not allowed", 405);

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON");
  const { filename, contentType, dataBase64 } = body as {
    filename?: string;
    contentType?: string;
    dataBase64?: string;
  };
  if (!dataBase64) return err("Keine Datei erhalten");

  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.byteLength > MAX_BYTES) {
    return err("Datei zu groß (max. 4.5 MB)", 413);
  }

  const fileId = newId();
  await uploadsStore().set(fileId, buffer);
  await uploadsMetaStore().setJSON(fileId, {
    filename: filename || fileId,
    contentType: contentType || "application/octet-stream",
    owner: username,
    size: buffer.byteLength,
    createdAt: Date.now(),
  });

  return json({ fileId });
};

export const config: Config = {
  path: "/api/upload",
};

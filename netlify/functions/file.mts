import type { Config } from "@netlify/functions";
import { uploadsStore, uploadsMetaStore } from "./_lib/util.mts";

export default async (req: Request) => {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const fileId = parts[parts.length - 1];
  if (!fileId) return new Response("Not found", { status: 404 });

  const meta = await uploadsMetaStore().get(fileId, { type: "json" });
  if (!meta) return new Response("Not found", { status: 404 });

  const data = await uploadsStore().get(fileId, { type: "arrayBuffer" });
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(data, {
    status: 200,
    headers: {
      "content-type": meta.contentType || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};

export const config: Config = {
  path: "/file/*",
};

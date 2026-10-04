import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildVoiceLabSite, outputRoot as siteRoot } from "../../../scripts/build-voice-lab-site.mjs";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const port = Number(process.env.VOICE_LAB_REVIEW_PORT ?? 4174);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wav", "audio/wav"],
]);

function resolveRequestPath(url) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname); } catch { return null; }
  const compare = pathname === "/compare" || pathname === "/retune" || pathname.startsWith("/review/") || pathname.startsWith("/config/") || pathname.startsWith("/output/");
  const root = compare ? labRoot : siteRoot;
  const relative = pathname === "/" ? "index.html" : pathname === "/compare" || pathname === "/retune" ? "review/index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

const server = createServer(async (request, response) => {
  const file = resolveRequestPath(request.url ?? "/");
  if (!file) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    const contentType = mimeTypes.get(path.extname(file).toLowerCase()) ?? "application/octet-stream";
    const range = request.headers.range;
    if (range && contentType === "audio/wav") {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        response.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
        return;
      }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) {
        response.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
        return;
      }
      response.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${info.size}`,
        "Content-Type": contentType,
      });
      createReadStream(file, { start, end }).pipe(response);
      return;
    }
    response.writeHead(200, { "Content-Length": info.size, "Content-Type": contentType });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not Found");
  }
});

await buildVoiceLabSite();
server.listen(port, host, () => {
  console.log(`Yokogawa AI Voice Lab review: http://${host}:${port}`);
  console.log(`Voice Retune: http://${host}:${port}/retune`);
  console.log(`Round comparison: http://${host}:${port}/compare`);
});

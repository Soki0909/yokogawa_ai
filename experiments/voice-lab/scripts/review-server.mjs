import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildVoiceLabSite, outputRoot as siteRoot } from "../../../scripts/build-voice-lab-site.mjs";
import { applyCandidateSynthesisText, applyRetuneParameters } from "./retune-voice-lab.mjs";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const port = Number(process.env.VOICE_LAB_REVIEW_PORT ?? 4174);
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const [engineConfig, candidateConfig] = await Promise.all([
  readJson(path.join(labRoot, "config", "engine.json")),
  readJson(path.join(labRoot, "config", "candidates-retune.json")),
]);
const sandboxBase = candidateConfig.candidates.find((candidate) => candidate.id === "2d");
if (!sandboxBase) throw new Error("Voice Sandbox requires Candidate 2D.");

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
  const compare = pathname === "/compare" || pathname === "/retune" || pathname === "/pause-test" || pathname === "/provisional" || pathname === "/sandbox" || pathname.startsWith("/review/") || pathname.startsWith("/shared/") || pathname.startsWith("/config/") || pathname.startsWith("/output/");
  const root = compare ? labRoot : siteRoot;
  const relative = pathname === "/" ? "index.html" : pathname === "/sandbox" ? "review/sandbox.html" : pathname === "/compare" || pathname === "/retune" || pathname === "/pause-test" || pathname === "/provisional" ? "review/index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

function readRequestBody(request, maxBytes = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0; let tooLarge = false;
    request.on("data", (chunk) => { bytes += chunk.length; if (bytes > maxBytes) tooLarge = true; else chunks.push(chunk); });
    request.on("end", () => tooLarge ? reject(new Error("Request body is too large.")) : resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function boundedNumber(value, name, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return number;
}

async function synthesizeSandbox(request, response) {
  try {
    const body = JSON.parse(await readRequestBody(request)); const text = String(body.text ?? "").trim();
    if (!text || [...text].length > 500) throw new Error("Text must contain 1 to 500 characters.");
    const modes = { none: null, one: "…", two: "……" };
    if (!(body.punctuationMode in modes)) throw new Error("Unknown punctuation mode.");
    const suffix = modes[body.punctuationMode];
    const synthesisText = suffix ? applyCandidateSynthesisText(text, { id: "full-stop-ellipsis-v1", suffix }) : text;
    const parameters = { ...sandboxBase.parameters,
      speedScale: boundedNumber(body.parameters?.speedScale, "speedScale", .8, 1.3),
      intonationScale: boundedNumber(body.parameters?.intonationScale, "intonationScale", 0, 1),
      tempoDynamicsScale: boundedNumber(body.parameters?.tempoDynamicsScale, "tempoDynamicsScale", 0, 1),
      pauseLengthScale: boundedNumber(body.parameters?.pauseLengthScale, "pauseLengthScale", .5, 2),
    };
    const queryParams = new URLSearchParams({ text: synthesisText, speaker: String(sandboxBase.styleId) });
    const queryResponse = await fetch(`${engineConfig.baseUrl}/audio_query?${queryParams}`, { method: "POST" });
    if (!queryResponse.ok) throw new Error(`AivisSpeech audio_query failed: ${queryResponse.status}`);
    const query = applyRetuneParameters(await queryResponse.json(), parameters);
    const synthesisResponse = await fetch(`${engineConfig.baseUrl}/synthesis?speaker=${sandboxBase.styleId}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(query),
    });
    if (!synthesisResponse.ok) throw new Error(`AivisSpeech synthesis failed: ${synthesisResponse.status}`);
    const wav = Buffer.from(await synthesisResponse.arrayBuffer());
    response.writeHead(200, { "Cache-Control": "no-store", "Content-Length": wav.length, "Content-Type": "audio/wav", "X-Synthesis-Text": encodeURIComponent(synthesisText) });
    response.end(wav);
  } catch (error) {
    const payload = Buffer.from(JSON.stringify({ error: error.message }));
    response.writeHead(400, { "Cache-Control": "no-store", "Content-Length": payload.length, "Content-Type": "application/json; charset=utf-8" }); response.end(payload);
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "POST" && new URL(request.url ?? "/", `http://${host}:${port}`).pathname === "/api/sandbox/synthesize") {
    await synthesizeSandbox(request, response); return;
  }
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
  console.log(`Sentence pause test: http://${host}:${port}/pause-test`);
  console.log(`Provisional profile: http://${host}:${port}/provisional`);
  console.log(`Voice Sandbox: http://${host}:${port}/sandbox`);
  console.log(`Round comparison: http://${host}:${port}/compare`);
});

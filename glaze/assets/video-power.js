/* ============================================================
   Glaze · Video power engine (ES module, lazy-loaded, optional)
   Wraps ffmpeg.wasm (single-thread core, from CDN) to convert the
   trimmed/edited clip to MP4, GIF, MOV or WebM — fully on-device.
   Loaded only when the user picks "Power export".
   ============================================================ */
import { FFmpeg } from "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
import { fetchFile, toBlobURL } from "https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js";

let ffmpeg = null;

async function ensureLoaded() {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  ffmpeg = new FFmpeg();
  const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
  });
  return ffmpeg;
}

function atempoChain(speed) {
  let s = speed; const parts = [];
  while (s > 2) { parts.push("atempo=2.0"); s /= 2; }
  while (s < 0.5) { parts.push("atempo=0.5"); s /= 0.5; }
  parts.push("atempo=" + s.toFixed(4));
  return parts.join(",");
}

function videoFilters(p) {
  const vf = [];
  if (p.brightness || p.contrast || p.saturation) {
    vf.push("eq=brightness=" + (p.brightness / 100 * 0.4).toFixed(3) +
      ":contrast=" + (1 + p.contrast / 100).toFixed(3) +
      ":saturation=" + Math.max(0, 1 + p.saturation / 100).toFixed(3));
  }
  if (p.rot === 90) vf.push("transpose=1");
  else if (p.rot === 270) vf.push("transpose=2");
  else if (p.rot === 180) { vf.push("hflip"); vf.push("vflip"); }
  if (p.flipH) vf.push("hflip");
  if (p.flipV) vf.push("vflip");
  if (p.speed !== 1) vf.push("setpts=" + (1 / p.speed).toFixed(4) + "*PTS");
  if (p.fmt === "gif") { vf.push("fps=12"); vf.push("scale=480:-1:flags=lanczos"); }
  return vf;
}

const OUT = {
  mp4: { name: "out.mp4", mime: "video/mp4" },
  mov: { name: "out.mov", mime: "video/quicktime" },
  webm: { name: "out.webm", mime: "video/webm" },
  gif: { name: "out.gif", mime: "image/gif" },
};

export async function convert(file, params, onProgress) {
  const fm = await ensureLoaded();
  if (onProgress) fm.on("progress", (e) => onProgress(e.progress || 0));

  const inName = "input" + (file.name && file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ".bin");
  await fm.writeFile(inName, await fetchFile(file));

  const dur = Math.max(0.05, params.out - params.in);
  const args = ["-ss", String(params.in), "-t", String(dur), "-i", inName];

  const vf = videoFilters(params);
  if (vf.length) args.push("-vf", vf.join(","));

  const hasAudio = !params.mute && params.fmt !== "gif";
  if (!hasAudio) args.push("-an");

  const out = OUT[params.fmt] || OUT.mp4;
  if (params.fmt === "gif") {
    args.push("-loop", "0");
  } else if (params.fmt === "webm") {
    args.push("-c:v", "libvpx", "-b:v", "2M", "-crf", "12");
    if (hasAudio) args.push("-c:a", "libvorbis");
  } else {
    // mp4 / mov -> H.264
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p");
    if (hasAudio) {
      args.push("-c:a", "aac", "-b:a", "128k");
      if (params.speed !== 1) args.push("-af", atempoChain(params.speed));
    }
  }
  args.push(out.name);

  await fm.exec(args);
  const data = await fm.readFile(out.name);
  try { await fm.deleteFile(inName); await fm.deleteFile(out.name); } catch (e) {}
  return new Blob([data.buffer], { type: out.mime });
}

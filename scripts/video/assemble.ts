// Builds the silent master and the cue sheet from the recorded clips (scripts/video/record.ts).
//   npx tsx scripts/video/assemble.ts
// Cuts only the ranges scenes marked as dead waiting time; every kept frame plays at its real speed.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderCards } from "./cards.ts";
import { FPS, OUT, type Marker } from "./lib.ts";

const CLIPS = join(OUT, "clips");
const WORK = join(OUT, "work");
const FADE = 0.3;
/** Seconds of the wait kept before a cut, and of the result shown before the cut ends (so it appears on camera). */
const KEEP_BEFORE = 0.6;
const KEEP_AFTER = 1.0;

interface ClipInfo {
  name: string;
  markers: Marker[];
  facts: Record<string, string>;
}
const info = (name: string): ClipInfo => JSON.parse(readFileSync(join(CLIPS, `${name}.json`), "utf8"));
const duration = (file: string) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
const at = (c: ClipInfo, label: string) => {
  const m = c.markers.find((x) => x.label === label);
  if (!m) throw new Error(`${c.name}: no marker "${label}"`);
  return m.t;
};

/** A source range of one clip. */
interface Piece {
  clip: string;
  from: number;
  to: number;
}

/** Keeps a whole clip except its marked cut ranges. */
function withoutCuts(name: string): Piece[] {
  const c = info(name);
  const end = duration(join(CLIPS, `${name}.mp4`));
  const pieces: Piece[] = [];
  let from = 0;
  const starts = c.markers.filter((m) => m.kind === "cut-start");
  for (const s of starts) {
    const e = c.markers.find((m) => m.kind === "cut-end" && m.t > s.t);
    if (!e) continue;
    pieces.push({ clip: name, from, to: s.t + KEEP_BEFORE });
    from = Math.max(s.t + KEEP_BEFORE, e.t - KEEP_AFTER);
  }
  pieces.push({ clip: name, from, to: end });
  return pieces;
}

/**
 * The phone clip is a 393x659 viewport, encoded centred at 644x1080. Show it as a phone: cropped, inside a thin
 * bezel on the right; its caption is an overlay (cards.ts).
 */
const PHONE = ["crop=644:1080:638:0", "scale=-2:980:flags=lanczos", "pad=iw+6:ih+6:3:3:color=0x3a3d44", "pad=1920:1080:1060:(oh-ih)/2:color=0x0c0d0f"].join(",");

/** The popup clip is 580x513 with the 380px-wide popup on the left; crop it and centre it on the right half. */
const POPUP = ["crop=800:1080:349:0", "pad=1920:1080:960:0:color=0x0c0d0f"].join(",");

/** The dapp scene with the extension's approval windows spliced in where the dapp was waiting on them. */
function dappScene(): Piece[] {
  const d = info("6b-dapp");
  const whole = (name: string): Piece => ({ clip: name, from: 0, to: duration(join(CLIPS, `${name}.mp4`)) });
  return [
    { clip: "6b-dapp", from: 0, to: at(d, "connect") + 1.7 },
    whole("6c-approve-connect"),
    { clip: "6b-dapp", from: at(d, "connected") - 0.4, to: at(d, "sign-in") + 1.7 },
    whole("6d-approve-sign"),
    { clip: "6b-dapp", from: at(d, "verified") - 0.4, to: duration(join(CLIPS, "6b-dapp.mp4")) },
  ];
}

interface Scene {
  id: string;
  title: string;
  pieces: Piece[] | null; // null = a card
  /** Extra ffmpeg filters on the joined scene (framing), before the fades. */
  post?: string;
  /** A transparent 1920x1080 caption image laid over the scene (a key in the rendered cards). */
  caption?: string;
  card?: string;
  cardSeconds?: number;
}

/** Encodes one scene: its pieces trimmed and joined, faded in and out, as 1080p30 H.264. */
function encodeScene(s: Scene, cards: Record<string, string>): string {
  const out = join(WORK, `${s.id}.mp4`);
  if (!s.pieces) {
    const len = s.cardSeconds ?? 4;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-t", String(len), "-i", cards[s.card!], "-vf",
      `fps=${FPS},format=yuv420p,fade=t=in:st=0:d=${FADE},fade=t=out:st=${len - FADE}:d=${FADE}`, "-c:v", "libx264", "-preset", "slow", "-crf", "16", out]);
    return out;
  }
  const inputs: string[] = [];
  const filters: string[] = [];
  s.pieces.forEach((p, i) => {
    inputs.push("-i", join(CLIPS, `${p.clip}.mp4`));
    filters.push(`[${i}:v]trim=start=${p.from.toFixed(3)}:end=${p.to.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
  });
  const total = s.pieces.reduce((sum, p) => sum + (p.to - p.from), 0);
  filters.push(`${s.pieces.map((_, i) => `[v${i}]`).join("")}concat=n=${s.pieces.length}:v=1:a=0[cat]`);
  let base = "[cat]";
  if (s.post) {
    filters.push(`[cat]${s.post}[framed]`);
    base = "[framed]";
  }
  if (s.caption) {
    inputs.push("-loop", "1", "-i", cards[s.caption]);
    filters.push(`${base}[${s.pieces.length}:v]overlay=0:0:shortest=1[captioned]`);
    base = "[captioned]";
  }
  filters.push(`${base}fps=${FPS},format=yuv420p,fade=t=in:st=0:d=${FADE},fade=t=out:st=${(total - FADE).toFixed(3)}:d=${FADE}[out]`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", out]);
  return out;
}

/** Where a clip-time marker lands in the master. */
function masterTime(scenes: Scene[], starts: number[], clip: string, t: number): number | null {
  for (let i = 0; i < scenes.length; i++) {
    let offset = starts[i];
    for (const p of scenes[i].pieces ?? []) {
      if (p.clip === clip && t >= p.from && t <= p.to) return offset + (t - p.from);
      offset += p.to - p.from;
    }
  }
  return null;
}

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

async function main() {
  mkdirSync(WORK, { recursive: true });
  const cards = await renderCards(WORK);
  const scenes: Scene[] = [
    { id: "0-title", title: "Title", pieces: null, card: "title", cardSeconds: 4 },
    { id: "1-landing", title: "The problem", pieces: withoutCuts("1-landing") },
    { id: "2-onboard", title: "An account in seconds", pieces: withoutCuts("2-onboard") },
    { id: "3-send", title: "One transaction, three mempools", pieces: withoutCuts("3-send") },
    { id: "4-tamper", title: "Try to break it", pieces: withoutCuts("4-tamper") },
    { id: "5-swap", title: "Swap on Uniswap v4", pieces: withoutCuts("5-swap") },
    { id: "6a-popup", title: "Also a browser extension", pieces: [{ clip: "6a-popup", from: 0, to: duration(join(CLIPS, "6a-popup.mp4")) }], post: POPUP, caption: "popupCaption" },
    { id: "6-dapp", title: "Dapps: connect and sign in (ERC-1271)", pieces: dappScene() },
    { id: "7-phone", title: "On your phone", pieces: withoutCuts("7-phone"), post: PHONE, caption: "phoneCaption" },
    { id: "8-explorer", title: "Proof on the devnet", pieces: withoutCuts("8-explorer") },
    { id: "9-close", title: "Close", pieces: null, card: "close", cardSeconds: 5 },
  ];
  for (const s of scenes) for (const p of s.pieces ?? []) if (!existsSync(join(CLIPS, `${p.clip}.mp4`))) throw new Error(`missing clip ${p.clip}`);

  const files = scenes.map((s) => {
    const f = encodeScene(s, cards);
    console.log(`- ${s.id}: ${duration(f).toFixed(1)} s`);
    return f;
  });
  const list = join(WORK, "scenes.txt");
  writeFileSync(list, files.map((f) => `file '${f}'`).join("\n"));
  const master = join(OUT, "qrypt-demo-silent.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", master]);

  // Cue sheet: scene start times in the master, the moments inside them, and what actually happened.
  const starts: number[] = [];
  files.reduce((t, f) => (starts.push(t), t + duration(f)), 0);
  const lines = [`# Qrypt demo: cue sheet`, ``, `Master: ${master} (${mmss(duration(master))}, 1920x1080, ${FPS} fps, silent).`, ``];
  scenes.forEach((s, i) => {
    lines.push(`## ${mmss(starts[i])} ${s.title}`);
    const clipNames = [...new Set((s.pieces ?? []).map((p) => p.clip))];
    for (const name of clipNames) {
      const c = info(name);
      for (const m of c.markers.filter((x) => x.kind === "moment")) {
        const t = masterTime(scenes, starts, name, m.t);
        if (t !== null) lines.push(`- ${mmss(t)} ${m.label}`);
      }
      for (const [k, v] of Object.entries(c.facts)) lines.push(`- fact, ${k}: ${v}`);
    }
    lines.push("");
  });
  writeFileSync(join(OUT, "cues-timing.md"), lines.join("\n"));
  console.log(`master ${master} (${mmss(duration(master))})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

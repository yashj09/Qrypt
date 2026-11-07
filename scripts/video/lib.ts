// Demo-video capture helpers: a real-time CDP screencast of a Playwright page (sharp device pixels), a visible cursor,
// smooth mouse moves, and markers for cuts and key moments. Frames are re-timed to their real timestamps when encoded,
// so nothing is ever sped up; cuts only remove the ranges a scene marks as dead waiting time.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CDPSession, Locator, Page } from "playwright";

export const OUT = process.env.QRYPT_VIDEO_OUT ?? join(process.env.HOME!, "Movies/qrypt-demo");
export const FPS = 30;

/** An arrow cursor and a click ripple, drawn in the page so the screencast shows them. */
export const CURSOR_SCRIPT = `
(() => {
  const install = () => {
    if (document.getElementById("__demo_cursor")) return;
    const c = document.createElement("div");
    c.id = "__demo_cursor";
    c.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:none";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.8 L11.5 21.5 L14.2 20.3 L11.3 13.7 L17.5 13.7 Z" fill="white" stroke="black" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.transform = "translate(" + (e.clientX - 3) + "px," + (e.clientY - 2) + "px)"; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;border:2px solid rgba(196,240,74,.9);width:10px;height:10px;left:" + (e.clientX - 5) + "px;top:" + (e.clientY - 5) + "px;transition:all .45s ease-out;opacity:1";
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.width = r.style.height = "44px"; r.style.left = (e.clientX - 22) + "px"; r.style.top = (e.clientY - 22) + "px"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 500);
    }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install); else install();
})();
`;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The last place the cursor was moved to, per page, so moves start from there. */
const cursorAt = new WeakMap<Page, { x: number; y: number }>();

export async function moveTo(page: Page, target: Locator, steps = 28) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("element has no box");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const from = cursorAt.get(page) ?? { x: x - 220, y: y + 160 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.move(x, y, { steps });
  cursorAt.set(page, { x, y });
}

/** Move there like a person would, pause, then click. */
export async function click(page: Page, target: Locator, pauseMs = 350) {
  await target.waitFor({ state: "visible" });
  await moveTo(page, target);
  await sleep(pauseMs);
  await target.click();
}

/** Type with a human rhythm. */
export async function type(page: Page, target: Locator, text: string) {
  await click(page, target);
  await target.fill("");
  await page.keyboard.type(text, { delay: 70 });
}

/** Smooth wheel scroll by `px`, over `ms`. */
export async function scroll(page: Page, px: number, ms = 2500) {
  const steps = Math.max(10, Math.round(ms / 40));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps);
    await sleep(ms / steps);
  }
}

export interface Marker {
  t: number; // seconds since the clip started
  kind: "cut-start" | "cut-end" | "moment";
  label: string;
}

/**
 * A real-time screencast of one page. Frames arrive only when the page repaints; each keeps its wall-clock
 * timestamp, and `encode` shows every frame for exactly as long as it was on screen.
 */
export class Clip {
  private frames: { file: string; ts: number }[] = [];
  private cdp!: CDPSession;
  private dir: string;
  private t0 = 0;
  private stoppedAt = 0;
  readonly markers: Marker[] = [];
  readonly facts: Record<string, string> = {};

  constructor(readonly name: string, readonly page: Page) {
    this.dir = join(OUT, "frames", name);
  }

  async start() {
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", async (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
      const ts = f.metadata.timestamp ?? Date.now() / 1000;
      if (!this.t0) this.t0 = ts;
      const file = join(this.dir, `${String(this.frames.length).padStart(6, "0")}.jpg`);
      writeFileSync(file, Buffer.from(f.data, "base64"));
      this.frames.push({ file, ts });
      await this.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
    });
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
    // A tiny repaint so the first frame arrives immediately.
    await this.page.evaluate(() => document.body.style.setProperty("--demo-tick", String(Math.random())));
    await sleep(300);
  }

  private now() {
    return this.t0 ? Date.now() / 1000 - this.t0 : 0;
  }

  mark(label: string) {
    this.markers.push({ t: this.now(), kind: "moment", label });
  }
  cutStart(label: string) {
    this.markers.push({ t: this.now(), kind: "cut-start", label });
  }
  cutEnd(label: string) {
    this.markers.push({ t: this.now(), kind: "cut-end", label });
  }
  fact(key: string, value: string) {
    this.facts[key] = value;
  }

  async stop() {
    await sleep(400);
    this.stoppedAt = Date.now() / 1000;
    await this.cdp.send("Page.stopScreencast").catch(() => undefined);
    await this.cdp.detach().catch(() => undefined);
  }

  /** Encodes the frames at their real timing into a constant-frame-rate H.264 clip, then writes the markers. */
  encode() {
    if (this.frames.length === 0) throw new Error(`${this.name}: no frames captured`);
    const list = join(this.dir, "list.txt");
    const lines: string[] = [];
    this.frames.forEach((f, i) => {
      const next = i + 1 < this.frames.length ? this.frames[i + 1].ts : Math.max(f.ts + 1 / FPS, this.stoppedAt);
      lines.push(`file '${f.file}'`, `duration ${(next - f.ts).toFixed(4)}`);
    });
    lines.push(`file '${this.frames[this.frames.length - 1].file}'`);
    writeFileSync(list, lines.join("\n"));
    const out = join(OUT, "clips", `${this.name}.mp4`);
    mkdirSync(join(OUT, "clips"), { recursive: true });
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
      "-vf", `scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0c0d0f,fps=${FPS},format=yuv420p`,
      "-c:v", "libx264", "-preset", "slow", "-crf", "16", out,
    ]);
    writeFileSync(join(OUT, "clips", `${this.name}.json`), JSON.stringify({ name: this.name, markers: this.markers, facts: this.facts }, null, 2));
    return out;
  }
}

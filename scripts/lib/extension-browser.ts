import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type BrowserContext, type Worker } from "playwright";
import { ROOT } from "./config.ts";

export const EXTENSION_DIST = resolve(ROOT, "extension/dist");

/** A fresh Chromium profile with the built extension loaded; returns its id and service worker. */
export async function launchWithExtension(): Promise<{ context: BrowserContext; id: string; worker: Worker }> {
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "eyrie-ext-")), {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXTENSION_DIST}`, `--load-extension=${EXTENSION_DIST}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  return { context, id: new URL(worker.url()).host, worker };
}

export const extensionUrl = (id: string, page: string) => `chrome-extension://${id}/${page}`;

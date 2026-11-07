import { resolve } from "node:path";
import { del, get, list } from "@vercel/blob";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { ROOT } from "./lib/config.ts";

/**
 * World ID-gated onboarding, through the real staging flow with the World ID Simulator standing in for World App:
 * 1. a new wallet proves Proof of Human (World ID 4.0) and gets its sponsored account;
 * 2. the same simulated human, in a second fresh wallet, is refused ("already created a Qrypt account");
 * 3. closing World ID mid-way shows the cancel path with recovery options.
 * Needs a server with WORLD_* set to a staging app (QRYPT_WALLET, default the local dev server).
 */
const WALLET = process.env.QRYPT_WALLET ?? "http://localhost:5180";
const SHOTS = process.env.QRYPT_SHOTS;
const step = (msg: string) => console.log(`- ${msg}`);
const shot = (page: Page, name: string) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : Promise.resolve());

/** Starts onboarding in a fresh wallet and waits for the World ID widget. */
async function startOnboarding(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${WALLET}/app`);
  await page.getByText("Prove you're a unique human").first().waitFor({ timeout: 30_000 });
  await page.locator("#vault-password").fill("world-e2e-password");
  await page.locator("#vault-confirm").fill("world-e2e-password");
  await page.getByRole("button", { name: "Create with a password" }).click();
  await page.getByText("Connect your World ID").waitFor({ timeout: 60_000 });
  return page;
}

/** Approves the pending request in the simulator, as the simulator's (persistent) human. */
async function approveInSimulator(simulator: BrowserContext, page: Page) {
  const href = await page.getByRole("link", { name: "Use the simulator" }).getAttribute("href");
  if (!href) throw new Error("no simulator link in the World ID widget");
  const sim = await simulator.newPage();
  await sim.goto(href, { timeout: 60_000 });
  await sim.getByText("Complete verification").waitFor({ timeout: 60_000 });
  await sim.getByText("World ID 4.0", { exact: true }).click();
  await shot(sim, "world-simulator");
  await sim.getByRole("button", { name: "Continue" }).click();
  return sim;
}

/**
 * The simulator has a handful of fixed test humans, so the claims this run made are released at the end; otherwise the
 * next run's "first" human would already be used. Only claims made since `since` are touched.
 */
async function releaseTestClaims(since: number) {
  process.loadEnvFile(resolve(ROOT, ".env.local"));
  const { blobs } = await list({ prefix: "world/" });
  for (const blob of blobs) {
    const got = await get(blob.pathname, { access: "private", useCache: false });
    const record = got?.statusCode === 200 ? (JSON.parse(await new Response(got.stream).text()) as { at?: number }) : null;
    if (record?.at && record.at >= since) await del(blob.url);
  }
}

async function main() {
  const started = Date.now();
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  // One simulator profile = one simulated human, reused for the duplicate attempt.
  const simulator = await browser.newContext({ viewport: { width: 430, height: 900 } });
  try {
    const first = await startOnboarding(browser);
    await shot(first, "world-widget");
    step("onboarding asks for World ID Proof of Human before deploying (QR for World App, simulator link in staging)");
    await approveInSimulator(simulator, first);
    await first.getByText("Add token").waitFor({ timeout: 180_000 });
    const account = await first.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith("qpay.account."))?.[1]);
    step(`the simulator approved; the server verified the proof with World and deployed ${account}`);

    const second = await startOnboarding(browser);
    await approveInSimulator(simulator, second);
    await second.getByText("This World ID already created a Qrypt account").first().waitFor({ timeout: 120_000 });
    await shot(second, "world-duplicate");
    step("the same human in a second wallet is refused: one sponsored account per person");

    const third = await startOnboarding(browser);
    await third.getByRole("button", { name: /close/i }).first().click();
    await third.getByText("World ID verification was cancelled").first().waitFor({ timeout: 30_000 });
    await third.getByRole("button", { name: "I have a backup file" }).waitFor();
    // The never-used key was discarded, so the page is back at the start: protect a new key, or recover, or import.
    await third.locator("#vault-password").waitFor({ timeout: 10_000 });
    await shot(third, "world-cancelled");
    step("closing World ID shows the cancel path; the unused key is discarded and create, recover and import are offered again");
    console.log("PASS");
  } catch (err) {
    for (const ctx of browser.contexts())
      for (const p of ctx.pages()) console.error(`--- ${p.url().slice(0, 80)}\n${(await p.locator("body").innerText().catch(() => "")).replace(/\n+/g, " | ").slice(0, 600)}`);
    throw err;
  } finally {
    await browser.close();
    await releaseTestClaims(started).catch((e) => console.error("couldn't release test claims:", e));
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});

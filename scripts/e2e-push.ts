import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { del } from "@vercel/blob";
import { chromium, devices, type Browser, type Page } from "playwright";
import type { Address } from "viem";
import { pushPath } from "../app/src/lib/push-format.ts";
import { ROOT } from "./lib/config.ts";
import { skipWorldId, testContext } from "./lib/test-world.ts";

/**
 * Payment notifications end to end, through the real push service:
 * wallet A (an Android phone) turns notifications on in Settings, wallet B pays it 1 USDC, the push watcher sees the
 * Transfer and pushes, and A's service worker shows "Received 1.00 USDC". Then A turns them off.
 */
const WALLET = process.env.QRYPT_WALLET ?? "http://localhost:5180";
const step = (msg: string) => console.log(`- ${msg}`);
process.loadEnvFile(resolve(ROOT, ".env.local"));

async function onboardWithPassword(page: Page) {
  await page.goto(`${WALLET}/app`);
  await page.locator("#vault-password").fill("push-e2e-password", { timeout: 30_000 });
  await page.locator("#vault-confirm").fill("push-e2e-password");
  await page.getByRole("button", { name: "Create with a password" }).click();
  await page.getByRole("button", { name: "Scan" }).waitFor({ timeout: 90_000 });
  return (await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("qpay.account."));
    return key && localStorage.getItem(key);
  })) as Address;
}

const notificationTitles = (page: Page) =>
  page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.title));

async function waitForNotification(page: Page, title: string, ms: number) {
  await page
    .waitForFunction(
      async (t) => (await (await navigator.serviceWorker.ready).getNotifications()).some((n) => n.title === t),
      title,
      { timeout: ms, polling: 500 },
    )
    .catch(async () => {
      throw new Error(`no "${title}" notification; shown: ${JSON.stringify(await notificationTitles(page))}`);
    });
}

async function main() {
  const { defaultBrowserType: _ignored, ...android } = devices["Pixel 7"];
  const profile = mkdtempSync(join(tmpdir(), "qrypt-push-"));
  const state = join(profile, "watcher.json");
  const a = await skipWorldId(await chromium.launchPersistentContext(profile, { ...android, channel: "chromium", headless: true }));
  let browser: Browser | undefined;
  let watcher: ReturnType<typeof spawn> | undefined;
  let subscriptionPath: string | undefined;
  try {
    await a.grantPermissions(["notifications"], { origin: new URL(WALLET).origin });
    const pageA = a.pages()[0] ?? (await a.newPage());
    const account = await onboardWithPassword(pageA);
    step(`wallet A onboarded: ${account}`);

    await pageA.getByRole("button", { name: "Settings" }).click();
    const registered = pageA.waitForResponse((r) => r.url().endsWith("/api/push") && r.request().method() === "POST", {
      timeout: 90_000, // the first push subscription registers with FCM, which can take a while
    });
    await pageA.getByRole("switch", { name: "Payment received" }).click();
    const res = await registered;
    if (!res.ok()) throw new Error(`/api/push answered ${res.status()}: ${await res.text()}`);
    const endpoint = await pageA.evaluate(async () => (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint);
    subscriptionPath = pushPath(account, endpoint!); // deleted in finally, even if a later step fails
    await waitForNotification(pageA, "Payment notifications are on", 15_000);
    step(`turned notifications on: subscription signed by A's Falcon key and stored (${new URL(endpoint!).hostname})`);

    const forged = await pageA.evaluate(async (account) => {
      const sub = (await (await navigator.serviceWorker.ready).pushManager.getSubscription())!.toJSON();
      const record = { v: 1, account, subscription: { endpoint: sub.endpoint, keys: sub.keys } };
      const r = await fetch("/api/push", { method: "POST", body: JSON.stringify({ record, ts: Date.now(), signature: "0x1234" }) });
      return r.status;
    }, account);
    if (forged !== 401) throw new Error(`a subscription without A's signature got ${forged}`);
    step("a subscription not signed by the account is refused (401)");

    watcher = spawn("pnpm", ["-s", "push-watcher"], {
      cwd: ROOT,
      env: { ...process.env, QRYPT_PUSH_STATE: state, QRYPT_PUSH_REFRESH_MS: "2000" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true, // its own process group, so cleanup stops pnpm, tsx and node together
    });
    const watcherLog: string[] = [];
    watcher.stdout!.on("data", (d) => watcherLog.push(String(d)));
    watcher.stderr!.on("data", (d) => watcherLog.push(String(d)));
    const started = Date.now();
    while (!watcherLog.join("").includes("subscription(s)")) {
      if (Date.now() - started > 60_000) throw new Error(`watcher didn't load subscriptions:\n${watcherLog.join("")}`);
      await new Promise((r) => setTimeout(r, 500));
    }
    step("push watcher running and sees A's subscription");

    browser = await chromium.launch({ channel: "chromium", headless: true });
    const pageB = await (await testContext(browser, android)).newPage();
    await onboardWithPassword(pageB);
    await pageB.getByRole("button", { name: "Send", exact: true }).click();
    await pageB.getByRole("button", { name: "1", exact: true }).click();
    await pageB.getByRole("button", { name: "Next" }).click();
    await pageB.locator("#send-to").fill(account);
    await pageB.getByRole("button", { name: "Review" }).click();
    await pageB.getByRole("button", { name: /^Pay / }).click();
    await pageB.getByText(/Included in block \d+/).waitFor({ timeout: 120_000 }).catch(async (e) => {
      throw new Error(`B's payment didn't land: ${(await pageB.locator("body").innerText()).slice(0, 600)}`, { cause: e });
    });
    step("wallet B paid A 1 USDC");

    await waitForNotification(pageA, "Received 1.00 USDC", 60_000).catch(() => {
      throw new Error(`no payment notification on A. Watcher log:\n${watcherLog.join("")}`);
    });
    step("A's service worker showed \"Received 1.00 USDC\" via the real push service");

    await pageA.getByRole("switch", { name: "Payment received" }).click();
    await pageA.waitForFunction(async () => !(await (await navigator.serviceWorker.ready).pushManager.getSubscription()));
    step("turned notifications off: the browser unsubscribed");
    console.log("PASS");
  } finally {
    if (watcher?.pid) process.kill(-watcher.pid, "SIGTERM");
    if (subscriptionPath) await del(subscriptionPath).catch(() => undefined);
    await a.close();
    await browser?.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});

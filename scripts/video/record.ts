// Records the demo video's scenes from the live site, in real time, one clip per scene (see docs/video.md).
//   npx tsx scripts/video/record.ts [scene...]      (default: all scenes)
// Output: ~/Movies/qrypt-demo/clips/<scene>.mp4 + <scene>.json (markers, cut ranges, the real values seen).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, devices, type BrowserContext, type Page } from "playwright";
import { ROOT } from "../lib/config.ts";
import { CURSOR_SCRIPT, Clip, OUT, click, moveTo, scroll, sleep, type } from "./lib.ts";

const SITE = process.env.QRYPT_WALLET ?? "https://www.qrypt.money";
const PASSWORD = "qrypt-demo-video";
const DESKTOP = { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25, colorScheme: "dark" as const };
const only = process.argv.slice(2);
const want = (s: string) => only.length === 0 || only.includes(s);
const log = (msg: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`);

/** Runs a scene up to `tries` times; a devnet drop or timeout re-records it from the start. */
async function scene(name: string, fn: () => Promise<void>, tries = 2) {
  if (!want(name)) return;
  for (let i = 1; i <= tries; i++) {
    try {
      log(`scene ${name} (take ${i})`);
      await fn();
      log(`scene ${name} done`);
      return;
    } catch (e) {
      log(`scene ${name} failed: ${(e as Error).message.split("\n")[0]}`);
      if (i === tries) throw e;
    }
  }
}

async function record(name: string, page: Page, body: (clip: Clip) => Promise<void>) {
  const clip = new Clip(name, page);
  await clip.start();
  try {
    await body(clip);
  } finally {
    await clip.stop();
  }
  log(`encoded ${clip.encode()}`);
  return clip;
}

const nav = (page: Page, name: string) => click(page, page.locator("aside nav").getByRole("button", { name, exact: true }));
const hood = (page: Page) => page.locator('section[aria-label="Under the hood"]');

/** Waits for a transaction's status card to show inclusion, or throws if it was dropped or reverted. */
async function waitIncluded(page: Page, scope = page.locator("body"), timeoutMs = 240_000) {
  const included = scope.getByText(/Included in block \d+/).first();
  const failed = scope.getByText(/Dropped without being included|Reverted onchain/).first();
  const outcome = await Promise.race([
    included.waitFor({ timeout: timeoutMs }).then(() => "included" as const),
    failed.waitFor({ timeout: timeoutMs }).then(() => "failed" as const),
  ]);
  if (outcome === "failed") throw new Error(`transaction failed: ${await failed.textContent()}`);
  return (await included.textContent())!.match(/\d+/)![0];
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  const web = await browser.newContext(DESKTOP);
  await web.addInitScript(CURSOR_SCRIPT);
  const page = await web.newPage();
  let sendTx: { hash?: string; explorer?: string } = {};

  // 1. The problem: landing hero, then the gas comparison.
  await scene("1-landing", async () => {
    await page.goto(`${SITE}/`);
    await page.waitForLoadState("networkidle");
    await sleep(1500);
    await record("1-landing", page, async (clip) => {
      await sleep(3500);
      clip.mark("hero");
      const target = await page.getByText("Too heavy for the canonical mempool.").evaluate((el) => el.getBoundingClientRect().top + scrollY - 120);
      await scroll(page, target, 5000);
      clip.mark("gas bars");
      await sleep(6000);
    });
  });

  if (!want("2-onboard") && (want("3-send") || want("4-tamper") || want("5-swap"))) {
    // Off camera: a funded account for the wallet scenes.
    await page.goto(`${SITE}/app`);
    await page.locator("#vault-password").fill(PASSWORD, { timeout: 30_000 });
    await page.locator("#vault-confirm").fill(PASSWORD);
    await page.getByRole("button", { name: "Create with a password" }).click();
    await page.getByText("Add token").waitFor({ timeout: 120_000 });
  }

  // 2. An account in seconds (password onboarding on the live site), ending on the zero-ETH portfolio.
  await scene("2-onboard", async () => {
    await page.goto(`${SITE}/app`);
    await page.locator("#vault-password").waitFor({ timeout: 30_000 });
    await sleep(1000);
    await record("2-onboard", page, async (clip) => {
      await sleep(1500);
      await type(page, page.locator("#vault-password"), PASSWORD);
      await type(page, page.locator("#vault-confirm"), PASSWORD);
      await click(page, page.getByRole("button", { name: "Create with a password" }));
      await sleep(2500);
      clip.cutStart("deploying the account");
      await page.getByText("Add token").waitFor({ timeout: 120_000 });
      clip.cutEnd("account ready");
      clip.mark("portfolio");
      await moveTo(page, page.getByText("Assets", { exact: true }));
      await sleep(4500);
    });
  });

  // Off camera: keep the inspector beside the wallet for the next scenes (remembered in localStorage).
  if (want("3-send") || want("4-tamper") || want("5-swap")) {
    if (!page.url().includes("/app")) await page.goto(`${SITE}/app`);
    await page.locator("aside nav").waitFor({ timeout: 60_000 });
    await page.locator("aside nav").getByRole("button", { name: "Under the hood", exact: true }).click();
    const pin = page.getByRole("button", { name: "Keep open beside wallet" });
    const unpin = page.getByRole("button", { name: "Unpin" });
    await pin.or(unpin).first().waitFor({ timeout: 15_000 });
    if (await pin.isVisible()) await pin.click();
    await page.locator("aside nav").getByRole("button", { name: "Send", exact: true }).click();
    await hood(page).waitFor({ timeout: 15_000 });
  }

  // 3. The core: one signed transaction, three mempools, a real block, zero ETH, then the frames.
  await scene("3-send", async () => {
    await page.locator("aside nav").getByRole("button", { name: "Send", exact: true }).click();
    await hood(page).getByRole("tab", { name: "Mempools" }).click();
    await sleep(1000);
    const clip = await record("3-send", page, async (clip) => {
      await sleep(1500);
      await type(page, page.locator("#amount"), "5");
      await sleep(800);
      await click(page, page.getByRole("button", { name: "Review USDC payment" }));
      clip.mark("review");
      await sleep(3500);
      await click(page, page.getByRole("button", { name: "Sign and send" }));
      clip.mark("signed");
      // The three mempool answers fill in within a few seconds.
      await hood(page).getByText(/Admitted|Rejected/).first().waitFor({ timeout: 30_000 });
      await sleep(4500);
      clip.mark("verdicts");
      const verdicts = await hood(page).locator("[data-slot=item], [data-slot=card]").allInnerTexts();
      clip.fact("verdicts", verdicts.join(" | ").replace(/\s+/g, " ").slice(0, 600));
      await sleep(2000);
      clip.cutStart("waiting for a block");
      const block = await waitIncluded(page);
      clip.cutEnd("included");
      clip.fact("block", block);
      clip.mark("included");
      await sleep(1200);
      await moveTo(page, page.getByText("ETH on gas", { exact: true }).first());
      clip.mark("zero wei");
      await sleep(4000);
      await click(page, hood(page).getByRole("tab", { name: "Frames and gas" }));
      clip.mark("frames");
      await sleep(6500);
      const link = page.locator('a[href*="explorer.altmempool.wtf/tx/"]').first();
      sendTx = { explorer: (await link.getAttribute("href")) ?? undefined };
      clip.fact("explorer", sendTx.explorer ?? "");
    });
    writeFileSync(join(OUT, "send-tx.json"), JSON.stringify({ ...sendTx, facts: clip.facts }, null, 2));
  });

  // 4. Try to break it: a tampered signature is rejected at frame 0.
  await scene("4-tamper", async () => {
    await hood(page).getByRole("tab", { name: "Mempools" }).click();
    await sleep(800);
    await record("4-tamper", page, async (clip) => {
      await sleep(1200);
      await click(page, hood(page).getByRole("tab", { name: "Stress tests" }));
      await sleep(1500);
      const tamper = hood(page).locator("[data-slot=item]").filter({ hasText: "Tamper with the signature" });
      await click(page, tamper.getByRole("button"));
      clip.mark("tamper sent");
      await page.getByText(/BadFalconSignature/).first().waitFor({ timeout: 60_000 });
      await sleep(800);
      await click(page, hood(page).getByRole("tab", { name: "Mempools" }));
      clip.mark("rejected");
      await sleep(5500);
    });
  });

  // 5. Swap on Uniswap v4: USDC -> ETH, one atomic Falcon-signed batch.
  await scene("5-swap", async () => {
    await page.locator("aside nav").getByRole("button", { name: "Portfolio", exact: true }).click();
    await sleep(800);
    await record("5-swap", page, async (clip) => {
      await sleep(1000);
      await nav(page, "Swap");
      await sleep(1200);
      await click(page, page.getByRole("combobox", { name: "Receive" }));
      await click(page, page.getByRole("option", { name: "ETH", exact: true }));
      await type(page, page.locator("#swap-amount"), "10");
      await page.waitForFunction(() => Number((document.querySelector('[data-testid="swap-out"]')?.textContent ?? "0").replace(/,/g, "")) > 0, null, { timeout: 60_000 });
      clip.mark("quoted");
      await sleep(3000);
      await click(page, page.getByRole("button", { name: "Review swap" }));
      clip.mark("review");
      await sleep(5000);
      await click(page, page.getByRole("button", { name: "Swap USDC for ETH" }));
      clip.mark("signed");
      const card = page.locator("[data-slot=card]", { has: page.getByText(/^Swap 10\.00 USDC for ETH$/) });
      await card.waitFor({ timeout: 30_000 });
      await sleep(3500);
      clip.cutStart("waiting for a block");
      const block = await waitIncluded(page, card);
      clip.cutEnd("included");
      clip.fact("block", block);
      clip.fact("received", (await card.getByText("Received", { exact: true }).locator("..").locator("dd").textContent()) ?? "");
      await sleep(1000);
      await moveTo(page, card.getByText("Received", { exact: true }));
      clip.mark("received");
      await sleep(4500);
      await click(page, hood(page).getByRole("tab", { name: "Frames and gas" }));
      clip.mark("swap frames");
      await sleep(5000);
    });
  });

  // 8 (recorded here, while the web context is open): the send on the devnet explorer.
  await scene("8-explorer", async () => {
    const url = sendTx.explorer ?? JSON.parse((await import("node:fs")).readFileSync(join(OUT, "send-tx.json"), "utf8")).explorer;
    if (!url) throw new Error("no explorer link from scene 3");
    const ex = await web.newPage();
    await ex.goto(url);
    await ex.waitForLoadState("networkidle").catch(() => undefined);
    await sleep(2500);
    await record("8-explorer", ex, async (clip) => {
      await sleep(2000);
      clip.mark("explorer");
      await scroll(ex, 300, 2500);
      await sleep(4500);
    });
    await ex.close();
  });

  // 6. Extension: the popup wallet, then a dapp finds it, connects and signs in (verified onchain via ERC-1271).
  await scene("6-extension", async () => {
    const dist = resolve(ROOT, "extension/dist");
    const ext: BrowserContext = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "qrypt-video-ext-")), {
      channel: "chromium",
      headless: true,
      ...DESKTOP,
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    try {
      await ext.addInitScript(CURSOR_SCRIPT);
      const worker = ext.serviceWorkers()[0] ?? (await ext.waitForEvent("serviceworker"));
      const id = new URL(worker.url()).host;
      // Off camera: onboard the extension's own account.
      const onboarding =
        ext.pages().find((p) => p.url().includes("onboarding.html")) ??
        (await ext.waitForEvent("page", { predicate: (p) => p.url().includes("onboarding.html"), timeout: 15_000 }));
      await onboarding.getByText("Create a new wallet").click();
      await onboarding.locator("#new-password").fill(PASSWORD);
      await onboarding.locator("#confirm-password").fill(PASSWORD);
      await onboarding.getByRole("button", { name: "Create wallet" }).click();
      await onboarding.getByText("Your wallet is ready").waitFor({ timeout: 120_000 });
      await onboarding.close();

      const popup = await ext.newPage();
      await popup.setViewportSize({ width: 380, height: 600 });
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await popup.getByText("Assets").waitFor({ timeout: 30_000 });
      await sleep(1500);
      await record("6a-popup", popup, async (clip) => {
        clip.mark("popup");
        await sleep(4500);
      });
      await popup.close();

      const dapp = await ext.newPage();
      await dapp.goto(`${SITE}/dapp`);
      const qrypt = dapp.locator("[data-slot=item]").filter({ has: dapp.getByText("Qrypt", { exact: true }) });
      await qrypt.waitFor({ timeout: 30_000 });
      await sleep(1500);
      const approve = async (name: string, button: string, trigger: () => Promise<void>) => {
        const opened = ext.waitForEvent("page", { predicate: (p) => p.url().includes("approve.html"), timeout: 30_000 });
        await trigger();
        const win = await opened;
        await win.getByRole("button", { name: button, exact: true }).waitFor({ timeout: 30_000 });
        await sleep(600);
        await record(name, win, async (clip) => {
          await sleep(2500);
          clip.mark("approve");
          await click(win, win.getByRole("button", { name: button, exact: true }));
          await sleep(1200);
        });
      };
      await record("6b-dapp", dapp, async (clip) => {
        await sleep(2000);
        clip.mark("wallets listed");
        await moveTo(dapp, qrypt);
        await sleep(1500);
        clip.mark("connect");
        await approve("6c-approve-connect", "Connect", () => click(dapp, qrypt.getByRole("button", { name: "Connect" })));
        await dapp.getByText("Connected through Qrypt").waitFor({ timeout: 30_000 });
        clip.mark("connected");
        await sleep(3000);
        clip.mark("sign-in");
        await approve("6d-approve-sign", "Sign", () => click(dapp, dapp.getByRole("button", { name: "Sign in with Qrypt" })));
        await dapp.getByText("Signature verified onchain via ERC-1271").waitFor({ timeout: 90_000 });
        clip.mark("verified");
        await moveTo(dapp, dapp.getByText("Signature verified onchain via ERC-1271"));
        await sleep(5000);
      });
    } finally {
      await ext.close();
    }
  });

  // 7. Phone layout: created with (virtual) Face ID off camera, then home, request QR, swap, settings.
  await scene("7-phone", async () => {
    const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 15"];
    const phoneCtx = await browser.newContext({ ...iphone, deviceScaleFactor: 2, colorScheme: "dark" });
    await phoneCtx.addInitScript(CURSOR_SCRIPT);
    const phone = await phoneCtx.newPage();
    await phone.goto(`${SITE}/app`);
    const cdp = await phoneCtx.newCDPSession(phone);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
    });
    await phone.reload();
    await phone.getByRole("button", { name: "Create with Face ID" }).click({ timeout: 30_000 });
    await phone.getByRole("button", { name: "Scan" }).waitFor({ timeout: 120_000 });
    await sleep(3000);
    await record("7-phone", phone, async (clip) => {
      await sleep(2500);
      clip.mark("home");
      await click(phone, phone.getByRole("button", { name: "Receive", exact: true }));
      await phone.locator("#request-amount").waitFor();
      await type(phone, phone.locator("#request-amount"), "2");
      clip.mark("request QR");
      await sleep(3500);
      await click(phone, phone.getByRole("button", { name: "Back" }));
      await sleep(800);
      await click(phone, phone.getByRole("button", { name: "Swap", exact: true }));
      clip.mark("swap");
      await sleep(2500);
      await click(phone, phone.getByRole("button", { name: "Back" }));
      await sleep(800);
      await click(phone, phone.getByRole("button", { name: "Settings" }));
      await phone.getByText("Unlock methods").waitFor();
      clip.mark("settings");
      await sleep(1500);
      await scroll(phone, 260, 1500);
      await sleep(3500);
    });
    await phoneCtx.close();
  });

  await browser.close();
  log("all scenes recorded");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

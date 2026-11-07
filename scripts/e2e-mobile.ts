import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, devices, type Page } from "playwright";
import QRCode from "qrcode";
import { testContext } from "./lib/test-world.ts";

/**
 * The phone wallet on an iPhone 15 profile, with Chromium's virtual WebAuthn authenticator as Face ID:
 * onboard, hide balances, keypad send, open a pay link and pay it, scan a QR from a photo, under-the-hood sheet,
 * the home-screen shortcuts, and that Chromium considers /app installable.
 */
const WALLET = process.env.QRYPT_WALLET ?? "http://localhost:5180";
const SHOTS = process.env.QRYPT_SHOTS;
const PAYEE = "0x000000000000000000000000000000000000dEaD";
const step = (msg: string) => console.log(`- ${msg}`);
const shot = (page: Page, name: string) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : Promise.resolve());

async function faceId(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
  });
}

async function payAndWait(page: Page) {
  await page.getByRole("button", { name: /^Pay / }).click();
  const included = page.getByText(/Included in block \d+/);
  await included.waitFor({ timeout: 90_000 });
  return (await included.textContent())?.toLowerCase();
}

/** Chromium's own installability check (what Lighthouse's PWA audit used). Needs a non-incognito profile. */
async function checkInstallable() {
  const dir = mkdtempSync(join(tmpdir(), "qrypt-pwa-"));
  const context = await chromium.launchPersistentContext(dir, { channel: "chromium", headless: true });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${WALLET}/app`);
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 30_000 });
    const cdp = await context.newCDPSession(page);
    const manifest = await cdp.send("Page.getAppManifest");
    const critical = manifest.errors.filter((e) => e.critical);
    if (critical.length) throw new Error(`manifest errors: ${JSON.stringify(critical)}`);
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    if (installabilityErrors.length) throw new Error(`not installable: ${JSON.stringify(installabilityErrors)}`);
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  await checkInstallable();
  step("/app is installable: manifest parses, the service worker is active, no installability errors");

  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 15"];
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  try {
    const page = await (await testContext(browser, iphone)).newPage();
    await page.goto(`${WALLET}/app`);
    await faceId(page);
    await page.reload();
    await page.getByRole("button", { name: "Create with Face ID" }).click({ timeout: 30_000 });
    await page.getByRole("button", { name: "Scan" }).waitFor({ timeout: 90_000 });
    await page.waitForTimeout(2500);
    await shot(page, "phone-home");
    step("onboarded with Face ID on an iPhone-sized screen; home shows Receive / Send / Scan");

    await page.getByRole("button", { name: "Hide balances" }).click();
    await page.getByText("$••••").waitFor();
    await page.getByRole("button", { name: "Show balances" }).click();
    step("the eye hides and shows balances");

    await page.getByRole("button", { name: "Send", exact: true }).click();
    for (const k of ["1", ".", "5"]) await page.getByRole("button", { name: k, exact: true }).click();
    if ((await page.getByTestId("send-amount").textContent()) !== "1.5") throw new Error("keypad didn't build 1.5");
    await page.getByRole("button", { name: "Next" }).click();
    await page.locator("#send-to").fill(PAYEE);
    await page.getByRole("button", { name: "Review" }).click();
    await shot(page, "phone-review");
    step(`keypad send of 1.5 USDC: ${await payAndWait(page)}`);
    await page.getByRole("button", { name: "Done" }).click();

    await page.goto(`${WALLET}/pay?to=${PAYEE}&amount=2`);
    await page.getByRole("button", { name: "Pay 2.00 USDC" }).waitFor({ timeout: 30_000 });
    step(`opened a pay link straight into review; paid it: ${await payAndWait(page)}`);
    await page.getByRole("button", { name: "Done" }).click();

    const qr = "/tmp/qrypt-scan-test.png";
    writeFileSync(qr, await QRCode.toBuffer(`https://qrypt.money/pay?to=${PAYEE}&amount=0.75`, { width: 400, margin: 2 }));
    await page.getByRole("button", { name: "Scan" }).click();
    await page.locator("#scan-photo").setInputFiles(qr);
    await page.getByRole("button", { name: "Pay 0.75 USDC" }).waitFor({ timeout: 30_000 });
    step("scanned a pay-link QR from a photo; it opened as a 0.75 USDC payment");
    await page.getByRole("button", { name: "Back" }).click();

    await page.getByRole("button", { name: "Under the hood" }).click();
    await page.getByText("One EIP-8141 frame transaction").waitFor({ timeout: 15_000 });
    // Let the sheet finish sliding in before the screenshot.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    await shot(page, "phone-hood");
    step("the under-the-hood sheet shows the last transaction's mempools and frames");

    for (const [hash, title] of [["receive", "Receive"], ["scan", "Scan to pay"]]) {
      await page.goto(`${WALLET}/app#${hash}`);
      await page.getByRole("heading", { name: title }).waitFor({ timeout: 30_000 });
    }
    step("the home-screen shortcuts open Receive and Scan directly");
    console.log("PASS");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});

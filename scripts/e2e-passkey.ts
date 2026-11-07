import { chromium, type Page } from "playwright";
import { testContext } from "./lib/test-world.ts";

/**
 * The website wallet's vault end to end, with Chromium's virtual WebAuthn authenticator standing in for Face ID
 * (CTAP2, internal transport, user verification, resident keys, PRF): create with Face ID, lock, unlock with Face ID,
 * send; protect a legacy plain key; and the password fallback in a browser without passkeys.
 */
const WALLET = process.env.QRYPT_WALLET ?? "http://localhost:5180";
const step = (msg: string) => console.log(`- ${msg}`);

async function withFaceId(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });
}

/** The dashboard's sidebar. */
const nav = (page: Page, name: string) => page.locator("aside nav").getByRole("button", { name, exact: true }).click();

async function sendOne(page: Page) {
  await nav(page, "Send");
  await page.locator("#amount").fill("1");
  await page.getByRole("button", { name: "Review USDC payment" }).click();
  await page.getByRole("button", { name: "Sign and send" }).click();
  const included = page.getByText(/Included in block \d+/);
  await included.waitFor({ timeout: 120_000 });
  return (await included.textContent())?.match(/\d+/)?.[0];
}

async function main() {
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  try {
    const page = await (await testContext(browser, { viewport: { width: 1280, height: 800 } })).newPage();
    await page.goto(`${WALLET}/app`);
    await withFaceId(page);
    await page.reload();
    await page.getByRole("button", { name: "Create with Face ID" }).click({ timeout: 30_000 });
    await page.getByText("Add token").waitFor({ timeout: 90_000 });
    step("created a wallet with Face ID (virtual authenticator, PRF)");

    const stored = await page.evaluate(() => localStorage.getItem("eyrie.vault") ?? "");
    if (!stored.includes('"byTouchId"') || stored.includes('"byPassword":{')) throw new Error("vault should be passkey-only");
    if (await page.evaluate(() => localStorage.getItem("qpay.falconSeed"))) throw new Error("plain seed left in localStorage");
    step("the key is sealed under the passkey only; no plain copy");

    await page.getByRole("button", { name: "Lock" }).click();
    await page.getByRole("button", { name: "Unlock with Face ID" }).click({ timeout: 15_000 });
    await page.getByText("Add token").waitFor({ timeout: 30_000 });
    step("locked, then unlocked with Face ID");
    step(`sent 1 USDC, included in block ${await sendOne(page)}`);

    await nav(page, "Settings");
    await page.getByText("Recoverable with Face ID on your other devices.").waitFor({ timeout: 30_000 });
    const account = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith("qpay.account."))?.[1]);
    step(`Face ID recovery is saved for ${account}`);

    const recover = async () => {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.reload();
      await page.getByRole("button", { name: /recover with Face ID/ }).click({ timeout: 30_000 });
      await page.getByText("Recovered with Face ID").waitFor({ timeout: 60_000 });
      const got = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith("qpay.account."))?.[1]);
      if (got !== account) throw new Error(`recovered ${got}, expected ${account}`);
    };
    await recover();
    step(`wiped all site storage (a new phone), recovered the same account with Face ID, sent 1 USDC in block ${await sendOne(page)}`);

    await nav(page, "Settings");
    await page.getByRole("button", { name: "Rotate", exact: true }).click();
    await page.getByRole("button", { name: "Rotate key" }).click();
    await page.getByText("Key rotated").waitFor({ timeout: 90_000 });
    const resaved = page.waitForResponse((r) => r.url().includes("/api/recovery") && r.request().method() === "PUT", { timeout: 60_000 });
    if ((await resaved).status() !== 200) throw new Error(`re-saving recovery after rotation failed: ${(await (await resaved).text())}`);
    await recover();
    step(`rotated the key; recovery was re-saved, so a wiped device recovers the rotated key and sends: block ${await sendOne(page)}`);

    const forged = await page.evaluate(async (acct) => {
      const res = await fetch("/api/recovery", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: `0x${"ab".repeat(32)}`,
          record: { v: 1, account: acct, iv: "0x00", ct: "0x00", prfSalt: "0x00" },
          ts: Date.now(),
          signature: `0x${"00".repeat(1064)}`,
        }),
      });
      return res.status;
    }, account);
    if (forged !== 401) throw new Error(`a forged recovery upload returned ${forged}, expected 401`);
    step("a recovery upload without the account's Falcon signature is refused (401)");

    const legacy = await (await testContext(browser)).newPage();
    await legacy.goto(`${WALLET}/app`);
    const seed = `0x${"11".repeat(32)}`;
    await legacy.evaluate((s) => localStorage.setItem("qpay.falconSeed", s), seed);
    await legacy.reload();
    await legacy.getByText("Protect your key").waitFor({ timeout: 15_000 });
    await legacy.locator("#vault-password").fill("legacy-password-1");
    await legacy.locator("#vault-confirm").fill("legacy-password-1");
    await legacy.getByRole("button", { name: "Protect with a password" }).click();
    await legacy.getByText("Create your account").waitFor({ timeout: 15_000 });
    if (await legacy.evaluate(() => localStorage.getItem("qpay.falconSeed"))) throw new Error("legacy seed not removed");
    step("a legacy plain key was moved into a password vault and the plain copy deleted");

    const plain = await (await testContext(browser)).newPage();
    await plain.goto(`${WALLET}/app`);
    await plain.locator("#vault-password").fill("fallback-password-1");
    await plain.locator("#vault-confirm").fill("fallback-password-1");
    await plain.getByRole("button", { name: "Create with a password" }).click({ timeout: 30_000 });
    await plain.getByText("Add token").waitFor({ timeout: 90_000 });
    step("without passkeys, the wallet falls back to a password");
    console.log("PASS");
  } catch (err) {
    for (const ctx of browser.contexts())
      for (const p of ctx.pages()) {
        const text = await p.locator("body").innerText().catch(() => "");
        console.error(`--- ${p.url()}\n${text.replace(/\n+/g, " | ").slice(0, 600)}`);
      }
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});

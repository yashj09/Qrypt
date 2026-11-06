import { chromium, type Page } from "playwright";

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

async function sendOne(page: Page) {
  await page.locator("#amount").fill("1");
  await page.getByRole("button", { name: "Review USDC payment" }).click();
  await page.getByRole("button", { name: "Sign and send" }).click();
  await page.getByText("Recipient received").waitFor({ timeout: 90_000 });
  return page.locator("aside dd").first().textContent();
}

async function main() {
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
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

    const legacy = await (await browser.newContext()).newPage();
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

    const plain = await (await browser.newContext()).newPage();
    await plain.goto(`${WALLET}/app`);
    await plain.locator("#vault-password").fill("fallback-password-1");
    await plain.locator("#vault-confirm").fill("fallback-password-1");
    await plain.getByRole("button", { name: "Create with a password" }).click({ timeout: 30_000 });
    await plain.getByText("Add token").waitFor({ timeout: 90_000 });
    step("without passkeys, the wallet falls back to a password");
    console.log("PASS");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});

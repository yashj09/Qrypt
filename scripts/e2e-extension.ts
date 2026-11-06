import type { BrowserContext, Page } from "playwright";
import { extensionUrl, launchWithExtension } from "./lib/extension-browser.ts";

/**
 * The extension as a wallet, end to end, in a fresh Chromium profile:
 * onboarding opens on install, a password-locked vault holds the Falcon key, it locks and unlocks.
 */
const PASSWORD = "eyrie-e2e-password";
const step = (msg: string) => console.log(`- ${msg}`);

export async function onboard(context: BrowserContext): Promise<Page> {
  const page =
    context.pages().find((p) => p.url().includes("onboarding.html")) ??
    (await context.waitForEvent("page", { predicate: (p) => p.url().includes("onboarding.html"), timeout: 15_000 }));
  await page.getByText("Create a new wallet").click();
  await page.locator("#new-password").fill(PASSWORD);
  await page.locator("#confirm-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create wallet" }).click();
  await page.getByText("Your wallet is ready").waitFor({ timeout: 90_000 });
  return page;
}

async function main() {
  const { context, id, worker } = await launchWithExtension();
  try {
    await onboard(context);
    step("onboarding opened on install, created a password-locked wallet and account");

    const dash = await context.newPage();
    await dash.goto(extensionUrl(id, "dashboard.html"));
    await dash.locator("aside").waitFor({ timeout: 15_000 });
    step("dashboard opens unlocked");

    await worker.evaluate(() => chrome.storage.session.clear());
    await dash.getByText("Welcome back").waitFor({ timeout: 15_000 });
    step("locking shows the unlock screen");

    await dash.locator("#unlock-password").fill("not-the-password");
    await dash.getByRole("button", { name: "Unlock" }).click();
    await dash.getByText("Wrong password.").waitFor({ timeout: 15_000 });
    step("a wrong password is rejected");

    await dash.locator("#unlock-password").fill(PASSWORD);
    await dash.getByRole("button", { name: "Unlock" }).click();
    await dash.locator("aside").waitFor({ timeout: 15_000 });
    step("the right password unlocks");

    const sealed = await worker.evaluate(async () => JSON.stringify(await chrome.storage.local.get("eyrie.vault")));
    if (!sealed.includes('"ct"') || /"seed":"0x[0-9a-f]{64}"/.test(sealed)) throw new Error("vault isn't sealed");
    step("the seed is stored only as AES-GCM ciphertext");
    console.log("PASS");
  } finally {
    await context.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("FAIL", err);
    process.exit(1);
  });
}

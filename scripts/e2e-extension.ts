import type { BrowserContext, Page } from "playwright";
import { extensionUrl, launchWithExtension } from "./lib/extension-browser.ts";

/**
 * The extension as a wallet, end to end, in a fresh Chromium profile:
 * onboarding opens on install, a password-locked vault holds the Falcon key, it locks and unlocks.
 */
const PASSWORD = "eyrie-e2e-password";
const DAPP = process.env.EYRIE_DAPP ?? "http://localhost:5180";

/** Clicks `trigger`, then approves in the window the extension opens. */
async function approveIn(context: BrowserContext, button: string, trigger: () => Promise<void>) {
  const opened = context.waitForEvent("page", { predicate: (p) => p.url().includes("approve.html"), timeout: 30_000 });
  await trigger();
  const win = await opened;
  await win.getByRole("button", { name: button, exact: true }).click({ timeout: 30_000 });
}
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

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 600 });
    await popup.goto(extensionUrl(id, "popup.html"));
    await popup.getByText("Assets").waitFor({ timeout: 30_000 });
    await popup.waitForTimeout(3000);
    if (process.env.EYRIE_SHOTS) await popup.screenshot({ path: `${process.env.EYRIE_SHOTS}/popup.png` });
    await popup.getByRole("button", { name: "Send", exact: true }).click();
    await popup.locator("#amount").fill("1");
    await popup.getByRole("button", { name: "Review USDC payment" }).click();
    await popup.getByRole("button", { name: "Sign and send" }).click();
    const included = popup.getByText(/Included in block \d+/);
    await included.waitFor({ timeout: 90_000 });
    step(`popup sent 1 USDC, ${(await included.textContent())?.toLowerCase()}`);
    if (process.env.EYRIE_SHOTS) await popup.screenshot({ path: `${process.env.EYRIE_SHOTS}/popup-sent.png` });

    const dapp = await context.newPage();
    await dapp.goto(`${DAPP}/dapp`);
    const eyrie = dapp.locator("[data-slot=item]").filter({ has: dapp.getByText("Eyrie", { exact: true }) });
    await eyrie.waitFor({ timeout: 15_000 });
    await approveIn(context, "Connect", () => eyrie.getByRole("button", { name: "Connect" }).click());
    await dapp.getByText("Connected through Eyrie").waitFor({ timeout: 30_000 });
    step("dapp found Eyrie through EIP-6963 and connected; approved in the extension's own window");
    await approveIn(context, "Sign", () => dapp.getByRole("button", { name: "Sign in with Eyrie" }).click());
    await dapp.getByText("Signature verified onchain via ERC-1271").waitFor({ timeout: 60_000 });
    step("sign-in signed in the extension, verified onchain via ERC-1271");
    await approveIn(context, "Sign and send", () => dapp.getByRole("button", { name: "Claim 50 tEUR" }).click());
    const claimed = dapp.getByText(/included in block \d+/);
    await claimed.waitFor({ timeout: 120_000 });
    step(`dapp claim ${await claimed.textContent()}`);

    await worker.evaluate(() => chrome.storage.session.clear());
    const approval = context.waitForEvent("page", { predicate: (p) => p.url().includes("approve.html"), timeout: 30_000 });
    await dapp.getByRole("button", { name: "Sign in with Eyrie" }).click();
    const locked = await approval;
    await locked.getByText("Welcome back").waitFor({ timeout: 15_000 });
    await locked.locator("#unlock-password").fill(PASSWORD);
    await locked.getByRole("button", { name: "Unlock" }).click();
    await locked.getByRole("button", { name: "Sign", exact: true }).click({ timeout: 30_000 });
    await dapp.getByText("Signature verified onchain via ERC-1271").waitFor({ timeout: 60_000 });
    step("a request while locked asks for the password first, then signs");

    await dash.goto(extensionUrl(id, "dashboard.html#portfolio"));
    await dash.getByText("Assets").waitFor({ timeout: 30_000 });
    await dash.waitForTimeout(2500);
    if (process.env.EYRIE_SHOTS) await dash.screenshot({ path: `${process.env.EYRIE_SHOTS}/dashboard.png` });
    await dash.getByRole("button", { name: "Under the hood" }).click();
    await dash.getByText("One EIP-8141 frame transaction").waitFor();
    if (process.env.EYRIE_SHOTS) await dash.screenshot({ path: `${process.env.EYRIE_SHOTS}/dashboard-hood.png` });
    step("dashboard: portfolio and under the hood render");

    await dash.getByRole("button", { name: "Settings" }).click();
    await dash.getByRole("button", { name: "Rotate", exact: true }).click();
    await dash.getByRole("button", { name: "Rotate key" }).click();
    await dash.getByText("Key rotated").waitFor({ timeout: 90_000 });
    step("rotated the Falcon key from settings");

    await dash.getByRole("button", { name: "Back up", exact: true }).click();
    await dash.locator("#backup-password").fill(PASSWORD);
    await dash.locator("#backup-confirm").fill(PASSWORD);
    const download = dash.waitForEvent("download");
    await dash.getByRole("button", { name: "Download backup" }).click();
    const backupPath = `${process.env.EYRIE_SHOTS ?? "/tmp"}/eyrie-e2e-backup.json`;
    await (await download).saveAs(backupPath);
    const account = await dash.locator("aside .font-mono").first().textContent();
    step(`backed up the rotated key (${account})`);
    if (process.env.EYRIE_SHOTS) await dash.screenshot({ path: `${process.env.EYRIE_SHOTS}/dashboard-settings.png` });

    const second = await launchWithExtension();
    try {
      const onboarding =
        second.context.pages().find((p) => p.url().includes("onboarding.html")) ??
        (await second.context.waitForEvent("page", { predicate: (p) => p.url().includes("onboarding.html") }));
      await onboarding.getByText("Import a backup file").click();
      await onboarding.locator("#import-file").setInputFiles(backupPath);
      await onboarding.locator("#import-backup-password").fill(PASSWORD);
      await onboarding.locator("#new-password").fill(`${PASSWORD}-2`);
      await onboarding.locator("#confirm-password").fill(`${PASSWORD}-2`);
      await onboarding.getByRole("button", { name: "Import" }).click();
      await onboarding.getByText("Account imported").waitFor({ timeout: 60_000 });
      const imported = await onboarding.locator(".font-mono").first().textContent();
      if (imported !== account) throw new Error(`imported ${imported}, expected ${account}`);
      step(`imported the backup in a fresh browser: same account ${imported}`);
      const popup2 = await second.context.newPage();
      await popup2.setViewportSize({ width: 360, height: 600 });
      await popup2.goto(extensionUrl(second.id, "popup.html"));
      await popup2.getByRole("button", { name: "Send", exact: true }).click({ timeout: 30_000 });
      await popup2.locator("#amount").fill("1");
      await popup2.getByRole("button", { name: "Review USDC payment" }).click();
      await popup2.getByRole("button", { name: "Sign and send" }).click();
      const landed = popup2.getByText(/Included in block \d+/);
      await landed.waitFor({ timeout: 90_000 });
      step(`the imported, rotated key signs: ${(await landed.textContent())?.toLowerCase()}`);
    } finally {
      await second.context.close();
    }

    const sealed = await worker.evaluate(async () => JSON.stringify(await chrome.storage.local.get("eyrie.vault")));
    if (!sealed.includes('"ct"') || /"seed":"0x[0-9a-f]{64}"/.test(sealed)) throw new Error("vault isn't sealed");
    step("the seed is stored only as AES-GCM ciphertext");
    console.log("PASS");
  } catch (err) {
    for (const p of context.pages()) {
      const text = await p.locator("body").innerText().catch(() => "");
      console.error(`--- ${p.url()}\n${text.replace(/\n+/g, " | ").slice(-700)}`);
    }
    throw err;
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

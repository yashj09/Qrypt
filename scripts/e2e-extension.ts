import type { BrowserContext, Page } from "playwright";
import { launchWithExtension } from "./lib/extension-browser.ts";

/**
 * Drives the unpacked extension end to end against a running local wallet (`pnpm app`, port 5180):
 * onboard in /app, then in /dapp pick Eyrie from EIP-6963, connect, sign in (ERC-1271) and claim tEUR,
 * approving each request in the window the extension opens.
 */
const WALLET = process.env.EYRIE_WALLET ?? "http://localhost:5180";

const step = (msg: string) => console.log(`- ${msg}`);

/** The extension service worker's `chrome` global, as far as this script touches it. */
declare const chrome: { storage: { local: { set(items: Record<string, unknown>): Promise<void> } } };

async function approveNext(context: BrowserContext, button: string): Promise<void> {
  const popup = await context.waitForEvent("page", { predicate: (p) => p.url().includes("/connect"), timeout: 30_000 });
  await popup.getByRole("button", { name: button, exact: true }).click({ timeout: 30_000 });
}

async function main() {
  const { context, worker } = await launchWithExtension();
  try {
    if (WALLET.startsWith("http://localhost")) await worker.evaluate(() => chrome.storage.local.set({ useLocal: true }));
    step(`extension loaded: ${worker.url().split("/")[2]}`);

    const page: Page = await context.newPage();
    await page.goto(`${WALLET}/app`);
    await page.getByRole("button", { name: "Create my account" }).click({ timeout: 30_000 });
    await page.getByText("Add token").waitFor({ timeout: 90_000 });
    step("wallet account created in /app");

    await page.goto(`${WALLET}/dapp`);
    const eyrie = page.locator("[data-slot=item]").filter({ has: page.getByText("Eyrie", { exact: true }) });
    await eyrie.waitFor({ timeout: 15_000 });
    step("dapp discovered the extension through EIP-6963");

    const connected = approveNext(context, "Connect");
    await eyrie.getByRole("button", { name: "Connect" }).click();
    await connected;
    await page.getByText("Connected through Eyrie").waitFor({ timeout: 30_000 });
    step("connected");

    const signed = approveNext(context, "Sign");
    await page.getByRole("button", { name: "Sign in with Eyrie" }).click();
    await signed;
    await page.getByText("Signature verified onchain via ERC-1271").waitFor({ timeout: 60_000 });
    step("sign-in verified onchain via ERC-1271");

    const sent = approveNext(context, "Sign and send");
    await page.getByRole("button", { name: "Claim 50 tEUR" }).click();
    await sent;
    const included = page.getByText(/included in block \d+/);
    await included.waitFor({ timeout: 120_000 });
    step(`claim ${await included.textContent()}`);
    await page.getByText("tEUR balance: 50.00").waitFor({ timeout: 30_000 });
    step("dapp sees 50.00 tEUR");
    console.log("PASS");
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});

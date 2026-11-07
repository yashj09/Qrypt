import { chromium, devices, type Page } from "playwright";
import { testContext } from "./lib/test-world.ts";

/**
 * Uniswap v4 swaps in the wallet, end to end on the devnet:
 * desktop — onboard, USDC -> tEUR through the review dialog (receipt shows what arrived), then tEUR -> ETH (two hops);
 * phone — the Swap tile quotes live and reviews in a bottom sheet.
 * QRYPT_SHOTS=/tmp/qrypt-shots saves screenshots of each screen.
 */
const WALLET = process.env.QRYPT_WALLET ?? "http://localhost:5180";
const SHOTS = process.env.QRYPT_SHOTS;
const step = (msg: string) => console.log(`- ${msg}`);
const shot = (page: Page, name: string) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : Promise.resolve());

async function onboard(page: Page) {
  await page.goto(`${WALLET}/app`);
  await page.locator("#vault-password").fill("swap-e2e-password", { timeout: 30_000 });
  await page.locator("#vault-confirm").fill("swap-e2e-password");
  await page.getByRole("button", { name: "Create with a password" }).click();
}

/** Picks an asset in one of the panel's token menus ("Pay with" / "Receive"). */
async function pickToken(page: Page, menu: "Pay with" | "Receive", symbol: string) {
  await page.getByRole("combobox", { name: menu }).click();
  await page.getByRole("option", { name: symbol, exact: true }).click();
}

/** Waits for a non-zero quote in the "You receive" box and returns it. */
async function quoted(page: Page) {
  const out = page.getByTestId("swap-out");
  await page.waitForFunction(() => {
    const t = document.querySelector('[data-testid="swap-out"]')?.textContent ?? "0";
    return Number(t.replace(/,/g, "")) > 0;
  }, null, { timeout: 60_000 });
  return (await out.textContent())!;
}

/** Reviews and signs, then reads the status card of this swap (its title is "Swap <amount> <from> for <to>"). */
async function swapAndWait(page: Page, label: string, title: RegExp) {
  await page.getByRole("button", { name: "Review swap" }).click();
  await page.getByText("Minimum received").waitFor();
  await page.getByRole("button", { name: label }).click();
  const card = page.locator("[data-slot=card]", { has: page.getByText(title) });
  const included = card.getByText(/Included in block \d+/);
  await included.waitFor({ timeout: 240_000 });
  const received = await card.getByText("Received", { exact: true }).locator("..").locator("dd").textContent();
  return { block: (await included.textContent())?.match(/\d+/)?.[0], received };
}

async function main() {
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  try {
    const page = await (await testContext(browser, { viewport: { width: 1440, height: 900 } })).newPage();
    const nav = (name: string) => page.locator("aside nav").getByRole("button", { name, exact: true }).click();
    await onboard(page);
    await page.getByText("Add token").waitFor({ timeout: 90_000 });
    step("onboarded; Portfolio shows the Swap shortcut");

    await nav("Swap");
    await page.locator("#swap-amount").fill("10");
    const out = await quoted(page);
    await page.getByText(/^1 USDC = [\d.]+ tEUR$/).waitFor();
    await shot(page, "swap-desktop");
    step(`quoted 10 USDC -> ${out} tEUR live from the v4 quoter, with the rate line and countdown`);

    await page.getByRole("button", { name: "Review swap" }).click();
    await page.getByText("Route").waitFor();
    await page.getByText(/USDC → tEUR · 0\.05%/).waitFor();
    await shot(page, "swap-review");
    await page.getByRole("button", { name: "Cancel" }).click();
    const first = await swapAndWait(page, "Swap USDC for tEUR", /^Swap 10\.00 USDC for tEUR$/);
    if (!first.received?.includes("tEUR") || Number(first.received.replace(/[^\d.]/g, "")) < 9) throw new Error(`received ${first.received}`);
    await shot(page, "swap-done");
    step(`swapped 10 USDC for ${first.received} in block ${first.block}: approve + Permit2 + Universal Router, one atomic batch`);

    await pickToken(page, "Pay with", "tEUR");
    await pickToken(page, "Receive", "ETH");
    await page.locator("#swap-amount").fill("5");
    await quoted(page);
    await page.getByRole("button", { name: "Review swap" }).click();
    await page.getByText(/tEUR → USDC → ETH/).waitFor();
    await page.getByRole("button", { name: "Cancel" }).click();
    const second = await swapAndWait(page, "Swap tEUR for ETH", /^Swap 5\.00 tEUR for ETH$/);
    if (!second.received?.includes("ETH")) throw new Error(`received ${second.received}`);
    step(`two-hop tEUR -> USDC -> ETH: received ${second.received} in block ${second.block}`);

    await nav("Under the hood");
    await page.getByRole("tab", { name: "Frames and gas" }).click();
    await page.getByText("Uniswap v4: swap tEUR for ETH").first().waitFor({ timeout: 15_000 });
    step("under the hood lists the swap's frames by name");

    const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 15"];
    const phone = await (await testContext(browser, iphone)).newPage();
    await onboard(phone);
    await phone.getByRole("button", { name: "Swap", exact: true }).click({ timeout: 90_000 });
    await phone.locator("#swap-amount").fill("25");
    await quoted(phone);
    await phone.getByRole("button", { name: "Review swap" }).click();
    await phone.getByText("Minimum received").waitFor();
    await shot(phone, "swap-phone-review");
    step("phone: the Swap tile quotes live and reviews in a bottom sheet");
    console.log("PASS");
  } catch (err) {
    for (const ctx of browser.contexts())
      for (const p of ctx.pages()) console.error(`--- ${p.url()}\n${(await p.locator("body").innerText().catch(() => "")).replace(/\n+/g, " | ").slice(0, 700)}`);
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});

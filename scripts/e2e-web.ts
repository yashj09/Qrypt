import { chromium } from "playwright";

/** The website wallet end to end: onboard a fresh account in /app, pin the inspector, send 1 USDC, see it included. */
const WALLET = process.env.QRYPT_WALLET ?? "http://localhost:5180";
const step = (msg: string) => console.log(`- ${msg}`);

async function main() {
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const nav = (name: string) => page.locator("aside nav").getByRole("button", { name, exact: true }).click();
    await page.goto(`${WALLET}/app`);
    await page.locator("#vault-password").fill("web-e2e-password", { timeout: 30_000 });
    await page.locator("#vault-confirm").fill("web-e2e-password");
    await page.getByRole("button", { name: "Create with a password" }).click();
    await page.getByText("Add token").waitFor({ timeout: 90_000 });
    step("account created; the dashboard opens on Portfolio");

    await nav("Under the hood");
    await page.getByRole("button", { name: "Keep open beside wallet" }).click();
    await page.reload();
    await nav("Send");
    await page.locator('section[aria-label="Under the hood"]').getByText("One EIP-8141 frame transaction").waitFor({ timeout: 15_000 });
    step("pinned the inspector; after a reload it's still open beside Send");

    await page.locator("#amount").fill("1");
    await page.getByRole("button", { name: "Review USDC payment" }).click();
    await page.getByRole("button", { name: "Sign and send" }).click();
    const included = page.getByText(/Included in block \d+/).first();
    await included.waitFor({ timeout: 120_000 });
    step(`1 USDC sent, ${(await included.textContent())?.toLowerCase()}`);
    console.log("PASS");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});

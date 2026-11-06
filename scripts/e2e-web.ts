import { chromium } from "playwright";

/** The website wallet end to end: onboard a fresh account in /app, send 1 USDC, see it included. */
const WALLET = process.env.EYRIE_WALLET ?? "http://localhost:5180";
const step = (msg: string) => console.log(`- ${msg}`);

async function main() {
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${WALLET}/app`);
    await page.locator("#vault-password").fill("web-e2e-password", { timeout: 30_000 });
    await page.locator("#vault-confirm").fill("web-e2e-password");
    await page.getByRole("button", { name: "Create with a password" }).click();
    await page.getByText("Add token").waitFor({ timeout: 90_000 });
    step("account created");
    await page.locator("#amount").fill("1");
    await page.getByRole("button", { name: "Review USDC payment" }).click();
    await page.getByRole("button", { name: "Sign and send" }).click();
    await page.getByText("Recipient received").waitFor({ timeout: 90_000 });
    const block = await page.locator("aside dd").first().textContent();
    step(`1 USDC sent, included in block ${block}`);
    console.log("PASS");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});

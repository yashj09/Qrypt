import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Browser, BrowserContext, BrowserContextOptions } from "playwright";
import { ROOT } from "./config.ts";

/**
 * Onboarding needs a World ID Proof of Human, which a test can't produce. Test contexts skip it the way the server
 * allows: /api/world answers "not required", and /api/onboard carries the server-only QRYPT_TEST_KEY.
 * scripts/e2e-world.ts is the test that goes through the real World ID flow.
 */
function testKey(): string {
  if (!process.env.QRYPT_TEST_KEY && existsSync(resolve(ROOT, ".env.local"))) process.loadEnvFile(resolve(ROOT, ".env.local"));
  const key = process.env.QRYPT_TEST_KEY;
  if (!key) throw new Error("QRYPT_TEST_KEY is missing (.env.local)");
  return key;
}

export async function skipWorldId(context: BrowserContext): Promise<BrowserContext> {
  const key = testKey();
  await context.route("**/api/world", (route) => route.fulfill({ json: { enabled: false } }));
  await context.route("**/api/onboard", (route) =>
    route.continue({ headers: { ...route.request().headers(), "x-qrypt-test-key": key } }),
  );
  return context;
}

export const testContext = async (browser: Browser, options?: BrowserContextOptions) =>
  skipWorldId(await browser.newContext(options));

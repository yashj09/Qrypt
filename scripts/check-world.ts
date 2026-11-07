// The World ID gate on onboarding, without a human: every way a proof can be wrong is refused before any account is
// deployed, World's verifier rejects a forged proof, and nullifier claims are first-come, per key.
//   pnpm check:world            (against QRYPT_WALLET, default the local dev server)
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { keccak256, toHex, type Hex } from "viem";
import { ROOT, loadDeployment } from "./lib/config.ts";

process.loadEnvFile(resolve(ROOT, ".env.local"));
const { WORLD_ACTION, claimNullifier, releaseNullifier } = await import("../app/api/_world.ts");

const WALLET = process.env.QRYPT_WALLET ?? "http://localhost:5180";
const ok = (msg: string) => console.log(`- ${msg}`);
const d = loadDeployment(1337);
// A random 1024-byte key the factory has never seen, so onboarding would create a new account.
const pubkey = toHex(crypto.getRandomValues(new Uint8Array(1024)));
const keyHash = keccak256(pubkey);

async function onboard(world?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${WALLET}/api/onboard`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ pubkey, factory: d.factory, world }),
  });
  return { status: res.status, body: (await res.json()) as { code?: string; error?: string; account?: string } };
}

const info = (await (await fetch(`${WALLET}/api/world`)).json()) as { enabled: boolean; action: string; environment: string; rp_context: { rp_id: string; expires_at: number; created_at: number } };
assert.equal(info.enabled, true, "World ID must be configured for this check");
assert.equal(info.action, WORLD_ACTION);
assert.ok(info.rp_context.expires_at > info.rp_context.created_at);
ok(`/api/world signs a fresh ${info.environment} request for "${info.action}" (rp ${info.rp_context.rp_id})`);

const proof = (over: Record<string, unknown> = {}, item: Record<string, unknown> = {}) => ({
  protocol_version: "4.0",
  nonce: "0x01",
  action: WORLD_ACTION,
  environment: info.environment,
  responses: [{ identifier: "proof_of_human", issuer_schema_id: 1, signal_hash: hashSignal(keyHash), nullifier: "123456789", proof: ["1", "2", "3", "4", "5"], expires_at_min: 0, ...item }],
  ...over,
});

const cases: [string, unknown, Record<string, string>, number, string][] = [
  ["no proof", undefined, {}, 400, "world_proof_missing"],
  ["a wrong test key", undefined, { "x-qrypt-test-key": "nope" }, 400, "world_proof_missing"],
  ["another action", proof({ action: "something-else" }), {}, 400, "world_wrong_action"],
  ["the other environment", proof({ environment: info.environment === "staging" ? "production" : "staging" }), {}, 400, "world_wrong_environment"],
  ["a weaker credential", proof({}, { identifier: "passport", issuer_schema_id: 9303 }), {}, 400, "world_wrong_credential"],
  ["a proof for another key", proof({}, { signal_hash: hashSignal(keccak256("0x1234")) }), {}, 400, "world_signal_mismatch"],
];
for (const [name, world, headers, status, code] of cases) {
  const r = await onboard(world, headers);
  assert.equal(r.status, status, `${name}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.code, code, `${name}: ${JSON.stringify(r.body)}`);
  ok(`refused before deploying: ${name} (${code})`);
}

const forged = await onboard(proof());
assert.equal(forged.status, 400, JSON.stringify(forged.body));
assert.ok(!forged.body.account);
ok(`a well-formed but forged proof is rejected by World's verifier (${forged.body.code}: ${forged.body.error})`);

// Claims: the first key wins a nullifier, the same key may retry, another key is refused.
const nullifier = (`0x${"ee".repeat(31)}${Math.floor(Math.random() * 255).toString(16).padStart(2, "0")}`) as Hex;
try {
  assert.equal(await claimNullifier(nullifier, keyHash), true);
  assert.equal(await claimNullifier(nullifier, keyHash), true);
  assert.equal(await claimNullifier(nullifier, keccak256("0xbeef")), false);
  ok("a nullifier is claimed once: the same key can retry, a second key from the same human is refused");
} finally {
  await releaseNullifier(nullifier);
}
console.log("PASS");

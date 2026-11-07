import { timingSafeEqual } from "node:crypto"
import { BlobError, del, get, put } from "@vercel/blob"
import { hashSignal } from "@worldcoin/idkit-core/hashing"
import { signRequest } from "@worldcoin/idkit-core/signing"
import { keccak256, type Hex } from "viem"

/**
 * World ID for sponsored onboarding (server only). Each new account costs the onboarding float 0.02 ETH of stake and
 * 100 USDC, so creating one requires a World ID Proof of Human: one sponsored account per unique human.
 *
 * - The signal is keccak256 of the Falcon public key being registered, so a proof can't be reused for another key.
 * - Proofs are verified by World's Developer Portal; uniqueness is ours to enforce, by atomically claiming the
 *   proof's nullifier in the private Blob store before the account is deployed.
 */

export const WORLD_ACTION = "create-sponsored-account"

export interface WorldConfig {
  appId: `app_${string}`
  rpId: string
  signingKey: string
  environment: "production" | "staging"
}

/** null when World ID isn't configured (local development without env vars): onboarding is then ungated. */
export function worldConfig(): WorldConfig | null {
  const { WORLD_APP_ID, WORLD_RP_ID, WORLD_RP_SIGNING_KEY, WORLD_ENV } = process.env
  if (!WORLD_APP_ID || !WORLD_RP_ID || !WORLD_RP_SIGNING_KEY) return null
  return {
    appId: WORLD_APP_ID as `app_${string}`,
    rpId: WORLD_RP_ID,
    signingKey: WORLD_RP_SIGNING_KEY,
    environment: WORLD_ENV === "production" ? "production" : "staging",
  }
}

/** A fresh, short-lived request signature; the RP signing key never leaves the server. */
export function rpContext(cfg: WorldConfig) {
  const s = signRequest({ signingKeyHex: cfg.signingKey, action: WORLD_ACTION })
  return { rp_id: cfg.rpId, nonce: s.nonce, created_at: s.createdAt, expires_at: s.expiresAt, signature: s.sig }
}

/** What the client passes as the proof's signal for a given Falcon public key. */
export const signalFor = (pubkey: Hex) => keccak256(pubkey)

/** Automated tests skip World ID with a server-only secret header (QRYPT_TEST_KEY). */
export function hasTestBypass(request: Request): boolean {
  const expected = process.env.QRYPT_TEST_KEY
  const given = request.headers.get("x-qrypt-test-key")
  if (!expected || !given) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

type ResponseItem = { identifier?: string; signal_hash?: string; nullifier?: string; issuer_schema_id?: number }
type IDKitPayload = { protocol_version?: string; action?: string; environment?: string; responses?: ResponseItem[] }

export type HumanCheck = { ok: true; nullifier: string } | { ok: false; status: number; code: string; error: string }

const fail = (status: number, code: string, error: string): HumanCheck => ({ ok: false, status, code, error })
const sameField = (a: string, b: string) => {
  try {
    return BigInt(a) === BigInt(b)
  } catch {
    return false
  }
}

/**
 * Checks an IDKit result for this key: our action and environment, a Proof of Human credential (or a legacy Orb
 * proof), the signal bound to the key, and World's own verification.
 */
export async function verifyHuman(cfg: WorldConfig, payload: unknown, pubkey: Hex): Promise<HumanCheck> {
  const p = payload as IDKitPayload
  if (!p || typeof p !== "object" || !Array.isArray(p.responses) || p.responses.length === 0) {
    return fail(400, "world_proof_missing", "World ID verification is required to create a sponsored account.")
  }
  if (p.action !== WORLD_ACTION) return fail(400, "world_wrong_action", "This World ID proof is for a different action.")
  if (p.environment !== cfg.environment) return fail(400, "world_wrong_environment", `Expected a ${cfg.environment} World ID proof.`)
  const item = p.responses.find(
    (r) => r.identifier === "proof_of_human" || r.identifier === "orb" || r.issuer_schema_id === 1,
  )
  if (!item?.nullifier) return fail(400, "world_wrong_credential", "A sponsored account needs World ID Proof of Human (Orb).")
  if (!item.signal_hash || !sameField(item.signal_hash, hashSignal(signalFor(pubkey)))) {
    return fail(400, "world_signal_mismatch", "This World ID proof was made for a different key.")
  }

  const res = await fetch(`https://developer.world.org/api/v4/verify/${cfg.rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => null)
  if (!res) return fail(502, "world_unreachable", "Couldn't reach World ID to verify the proof. Try again.")
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; environment?: string; code?: string; detail?: string }
  if (!res.ok || body.success !== true) {
    return fail(400, body.code ?? "world_verification_failed", body.detail ?? "World ID couldn't verify this proof.")
  }
  if (body.environment && body.environment !== cfg.environment) return fail(400, "world_wrong_environment", `Expected a ${cfg.environment} World ID proof.`)
  // Nullifiers arrive as decimal (v4) or hex (v3); store one canonical form.
  return { ok: true, nullifier: `0x${BigInt(item.nullifier).toString(16).padStart(64, "0")}` }
}

const claimPath = (nullifier: string) => `world/${WORLD_ACTION}/${nullifier}.json`

/**
 * Claims a nullifier for a key, atomically: the first claim wins, a retry for the same key is allowed, a different key
 * is refused. Returns false if this human already sponsored another key.
 */
export async function claimNullifier(nullifier: string, keyHash: Hex): Promise<boolean> {
  try {
    await put(claimPath(nullifier), JSON.stringify({ key: keyHash, at: Date.now() }), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
    })
    return true
  } catch (e) {
    if (!(e instanceof BlobError)) throw e
    const existing = await get(claimPath(nullifier), { access: "private", useCache: false })
    if (!existing || existing.statusCode !== 200) throw e
    const record = JSON.parse(await new Response(existing.stream).text()) as { key?: string }
    return record.key?.toLowerCase() === keyHash.toLowerCase()
  }
}

/** Releases a claim when deployment failed, so the same human can try again. */
export const releaseNullifier = (nullifier: string) => del(claimPath(nullifier)).catch(() => undefined)

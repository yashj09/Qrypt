import { fromHex, random, toHex, type PasskeyKey } from "@/lib/vault/core"

/**
 * Passkeys as a way to unlock and recover the Falcon key, through WebAuthn's PRF extension: the authenticator derives
 * a secret for our salt, and HKDF turns it into an AES key. PRF is symmetric (CTAP hmac-secret), so a quantum attack
 * on the passkey's P-256 signature key doesn't reveal it, and the account's authority stays Falcon-512.
 *
 * One fixed salt is fine: PRF secrets differ per credential. It lets a brand-new device ask "any Qrypt passkey?" and
 * get the credential and its secret in a single Face ID prompt.
 */
export const PRF_SALT = toHex(new TextEncoder().encode("qrypt.money passkey prf v1 ....").slice(0, 32))

/**
 * Web passkeys are bound to a domain forever, so we only make them on the domain we keep, and bind them to
 * `qrypt.money` itself: they then work on the apex and on www, whichever is canonical.
 */
const onQrypt = () => location.hostname === "qrypt.money" || location.hostname.endsWith(".qrypt.money")
const RP_ID = () => (onQrypt() ? "qrypt.money" : undefined) // localhost and the extension use their own origin
export const passkeysAllowedHere = () => location.protocol === "chrome-extension:" || location.hostname === "localhost" || onQrypt()

interface PrfResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } }
}

export const credentialIdOf = (raw: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const rawCredentialId = (id: string) => Uint8Array.from(atob(id.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

async function kekFromSecret(secret: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("qrypt vault key") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

export async function passkeysAvailable(): Promise<boolean> {
  return passkeysAllowedHere() && !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
}

/** Asks for a passkey (Face ID / Touch ID) and its PRF secret. Without `credentialId`, any Qrypt passkey on the device. */
export async function askPasskey(credentialId?: string): Promise<PasskeyKey> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      rpId: RP_ID(),
      allowCredentials: credentialId ? [{ type: "public-key", id: rawCredentialId(credentialId) }] : [],
      userVerification: "required",
      extensions: { prf: { eval: { first: fromHex(PRF_SALT) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!assertion) throw new Error("Face ID was cancelled.")
  const secret = (assertion.getClientExtensionResults() as PrfResults).prf?.results?.first
  if (!secret) throw new Error("This passkey worked, but the browser didn't return a key from it (no WebAuthn PRF).")
  return { kek: await kekFromSecret(secret), credentialId: credentialIdOf(assertion.rawId), prfSalt: PRF_SALT }
}

export type CreatedPasskey = { ok: true; key: PasskeyKey } | { ok: false; reason: "no-prf" }

/** Makes a discoverable passkey for this wallet. Returns `no-prf` when the browser can't derive a key from it. */
export async function createPasskey(label = "Qrypt wallet"): Promise<CreatedPasskey> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Qrypt", id: RP_ID() },
      user: { id: random(16), name: label, displayName: label },
      challenge: random(32),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "required" },
      extensions: { prf: { eval: { first: fromHex(PRF_SALT) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!credential) throw new Error("Face ID setup was cancelled.")
  const prf = (credential.getClientExtensionResults() as PrfResults).prf
  if (!prf?.enabled) return { ok: false, reason: "no-prf" }
  const credentialId = credentialIdOf(credential.rawId)
  const secret = prf.results?.first
  // Some authenticators only return PRF output on get(), not on create().
  return { ok: true, key: secret ? { kek: await kekFromSecret(secret), credentialId, prfSalt: PRF_SALT } : await askPasskey(credentialId) }
}


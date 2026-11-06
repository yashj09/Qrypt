import { addTouchIdWrap, fromHex, random, toHex, touchIdWrap, unlockWithKey } from "./vault"

/**
 * Touch ID unlock through WebAuthn's PRF extension: the authenticator derives a secret from a salt we keep, and that
 * secret (through HKDF) wraps the vault's data key. Without PRF there is no secret to wrap with, so we don't offer
 * Touch ID at all rather than use it as a gate that doesn't actually protect the key.
 */

interface PrfResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } }
}

const b64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

async function kekFromPrf(secret: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("qrypt vault key, touch id") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

/** Asks the authenticator (Touch ID prompt) for the PRF secret of an existing credential. */
async function prfSecret(credentialId: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      allowCredentials: [{ type: "public-key", id: credentialId }],
      userVerification: "required",
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  const secret = (assertion?.getClientExtensionResults() as PrfResults | undefined)?.prf?.results?.first
  if (!secret) throw new Error("Touch ID worked, but this browser didn't return a key from it.")
  return secret
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
}

export type EnableResult = "enabled" | "no-prf"

/** Creates a Touch ID passkey and, if the browser supports PRF, wraps the vault key with it. Needs an unlocked vault. */
export async function enableTouchId(): Promise<EnableResult> {
  const salt = random(32)
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Qrypt" },
      user: { id: random(16), name: "qrypt-wallet", displayName: "Qrypt wallet" },
      challenge: random(32),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!credential) throw new Error("Touch ID setup was cancelled.")
  const prf = (credential.getClientExtensionResults() as PrfResults).prf
  if (!prf?.enabled) return "no-prf"
  const secret = prf.results?.first ?? (await prfSecret(new Uint8Array(credential.rawId), salt))
  await addTouchIdWrap(await kekFromPrf(secret), b64url(credential.rawId), toHex(salt))
  return "enabled"
}

export async function unlockWithTouchId() {
  const wrap = await touchIdWrap()
  if (!wrap) throw new Error("Touch ID isn't set up for this wallet.")
  const secret = await prfSecret(fromB64url(wrap.credentialId), fromHex(wrap.prfSalt))
  await unlockWithKey(await kekFromPrf(secret))
}

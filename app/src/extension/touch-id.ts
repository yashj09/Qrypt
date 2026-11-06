import { createPasskey, passkeysAvailable, askPasskey } from "@/lib/passkey"
import { addTouchIdWrap, touchIdWrap, unlockWithKey } from "./vault"

/** Touch ID in the extension: the shared passkey module, with the extension's own origin as the relying party. */
export const platformAuthenticatorAvailable = passkeysAvailable

export type EnableResult = "enabled" | "no-prf"

export async function enableTouchId(): Promise<EnableResult> {
  const created = await createPasskey("Qrypt extension")
  if (!created.ok) return "no-prf"
  await addTouchIdWrap(created.key)
  return "enabled"
}

export async function unlockWithTouchId() {
  const wrap = await touchIdWrap()
  if (!wrap) throw new Error("Touch ID isn't set up for this wallet.")
  await unlockWithKey((await askPasskey(wrap.credentialId)).kek)
}

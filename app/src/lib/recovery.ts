import { hashMessage, sha256, toBytes, type Address, type Hex } from "viem"
import { bytesToHex, hexToBytes } from "@qpay/frametx"
import { askPasskey } from "@/lib/passkey"
import { recoveryMessage, type RecoveryRecord } from "@/lib/recovery-format"
import { seedControls } from "@/lib/keys"
import { signerFromSeed, type Deployment } from "@/lib/qpay"
import { API_BASE } from "@/lib/site"
import { fromHex, open, seal, toHex, type PasskeyKey } from "@/lib/vault/core"

/** Fired after a recovery record is saved, so status displays can refresh. */
export const RECOVERY_SAVED = "qrypt:recovery-saved"

/** The server never sees the credential id itself, only its hash. */
const recoveryId = (credentialId: string): Hex => sha256(toBytes(credentialId))

/** Stores the seed, encrypted under the passkey's key, so Face ID can recover it on another device. */
export async function uploadRecovery(account: Address, passkey: PasskeyKey, seed: Hex) {
  const sealed = await seal(passkey.kek, fromHex(seed))
  const record: RecoveryRecord = { v: 1, account, iv: sealed.iv, ct: sealed.ct, prfSalt: passkey.prfSalt }
  const id = recoveryId(passkey.credentialId)
  const ts = Date.now()
  const digest = hexToBytes(hashMessage(recoveryMessage(id, record, ts)))
  const signature = bytesToHex(await signerFromSeed(seed).sign(digest))
  const res = await fetch(`${API_BASE}/api/recovery`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, record, ts, signature }),
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `recovery upload failed (${res.status})`)
  window.dispatchEvent(new Event(RECOVERY_SAVED))
}

export async function hasRecovery(credentialId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/recovery?id=${recoveryId(credentialId)}`)
  return res.ok
}

/** Face ID on a new device: find a Qrypt passkey, fetch its record, decrypt, and check the key still owns the account. */
export async function recoverWithPasskey(d: Deployment): Promise<{ account: Address; seed: Hex; passkey: PasskeyKey }> {
  const passkey = await askPasskey()
  const res = await fetch(`${API_BASE}/api/recovery?id=${recoveryId(passkey.credentialId)}`)
  if (res.status === 404) throw new Error("This passkey has no Qrypt recovery saved. Restore from a backup file instead.")
  if (!res.ok) throw new Error(`Couldn't reach the recovery service (${res.status}).`)
  const { record } = (await res.json()) as { record: RecoveryRecord }
  let seed: Hex
  try {
    seed = toHex(await open(passkey.kek, record))
  } catch {
    throw new Error("This passkey can't decrypt the saved recovery.")
  }
  if (!(await seedControls(d, record.account, seed))) {
    throw new Error("The saved key no longer controls the account. It may have been rotated on another device before recovery was updated.")
  }
  return { account: record.account, seed, passkey }
}

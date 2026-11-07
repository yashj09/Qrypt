import type { Hex } from "viem"
import type { KeyStore } from "@/lib/keystore"

/**
 * The encrypted key store shared by the website and the extension. A random data key encrypts the Falcon seed; the
 * data key is wrapped once per way of unlocking: a password (PBKDF2) and/or a passkey (WebAuthn PRF through HKDF).
 * Unlocking puts the data key in the backend's session area, and it locks again after 15 idle minutes.
 */

export interface Sealed {
  iv: Hex
  ct: Hex
}
export interface PasswordWrap extends Sealed {
  salt: Hex
  iterations: number
}
export interface PasskeyWrap extends Sealed {
  credentialId: string
  prfSalt: Hex
}
interface Vault {
  v: 1
  // `byTouchId` is the stored name from the extension's first release; it holds any passkey wrap.
  dataKey: { byPassword?: PasswordWrap; byTouchId?: PasskeyWrap }
  seed?: Sealed
  pendingSeed?: Sealed
}
interface Session {
  dataKey: Hex
  lastActive: number
}

/** Where a vault lives: a durable area for the sealed vault, and a short-lived one for the unlocked data key. */
export interface VaultBackend {
  read<T>(area: "local" | "session", key: string): Promise<T | undefined>
  write(area: "local" | "session", key: string, value: unknown): Promise<void>
  remove(area: "local" | "session", key: string): Promise<void>
  subscribe(listener: () => void): () => void
}

export type VaultState = "none" | "locked" | "unlocked"

const VAULT = "eyrie.vault"
const SESSION = "eyrie.session"
const PBKDF2_ITERATIONS = 600_000
export const AUTO_LOCK_MS = 15 * 60 * 1000

export const toHex = (b: ArrayBuffer | Uint8Array): Hex =>
  `0x${Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("")}` as Hex
export const fromHex = (h: Hex): Uint8Array<ArrayBuffer> => Uint8Array.from(h.slice(2).match(/../g) ?? [], (x) => parseInt(x, 16))
export const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

const aes = (raw: Uint8Array<ArrayBuffer>) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"])

export async function seal(key: CryptoKey, plain: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const iv = random(12)
  return { iv: toHex(iv), ct: toHex(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain)) }
}
export const open = async (key: CryptoKey, s: Sealed) =>
  new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromHex(s.iv) }, key, fromHex(s.ct)))

async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"])
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ])
}

async function wrapForPassword(dataKey: Uint8Array<ArrayBuffer>, password: string): Promise<PasswordWrap> {
  const salt = random(16)
  return { ...(await seal(await passwordKey(password, salt, PBKDF2_ITERATIONS), dataKey)), salt: toHex(salt), iterations: PBKDF2_ITERATIONS }
}

/** A key that unlocks the vault through a passkey: the KEK derived from its PRF output, and how to ask for it again. */
export interface PasskeyKey {
  kek: CryptoKey
  credentialId: string
  prfSalt: Hex
}

export function makeVault(backend: VaultBackend) {
  const readVault = () => backend.read<Vault>("local", VAULT)
  const writeVault = (v: Vault) => backend.write("local", VAULT, v)
  const readSession = async () => {
    const s = await backend.read<Session>("session", SESSION)
    return s && Date.now() - s.lastActive < AUTO_LOCK_MS ? s : undefined
  }
  const startSession = (dataKey: Uint8Array) =>
    backend.write("session", SESSION, { dataKey: toHex(dataKey), lastActive: Date.now() } satisfies Session)
  const unlocked = async () => {
    const s = await readSession()
    if (!s) throw new Error("Unlock the wallet first.")
    return { s, vault: (await readVault())! }
  }

  async function openField(field: "seed" | "pendingSeed"): Promise<Hex | null> {
    const [vault, s] = await Promise.all([readVault(), readSession()])
    const sealed = vault?.[field]
    if (!sealed || !s) return null
    return toHex(await open(await aes(fromHex(s.dataKey)), sealed))
  }

  async function sealField(field: "seed" | "pendingSeed", value: Hex | null) {
    const { s, vault } = await unlocked()
    const next = { ...vault }
    if (value) next[field] = await seal(await aes(fromHex(s.dataKey)), fromHex(value))
    else delete next[field]
    await writeVault(next)
  }

  async function unlockWithPassword(password: string) {
    const w = (await readVault())?.dataKey.byPassword
    if (!w) throw new Error("This wallet has no password; unlock it with your passkey.")
    let dataKey: Uint8Array
    try {
      dataKey = await open(await passwordKey(password, fromHex(w.salt), w.iterations), w)
    } catch {
      throw new Error("Wrong password.")
    }
    await startSession(dataKey)
  }

  const keyStore: KeyStore = {
    seed: () => openField("seed"),
    save: (seed) => sealField("seed", seed),
    pending: { get: () => openField("pendingSeed"), set: (seed) => sealField("pendingSeed", seed) },
    clear: async () => {
      await backend.remove("local", VAULT)
      await backend.remove("session", SESSION)
    },
  }

  return {
    keyStore,

    async state(): Promise<VaultState> {
      if (!(await readVault())) return "none"
      return (await readSession()) ? "unlocked" : "locked"
    },

    /** Creates an empty vault with at least one way to unlock it, and leaves it unlocked. */
    async create(unlockWith: { password?: string; passkey?: PasskeyKey }) {
      if (!unlockWith.password && !unlockWith.passkey) throw new Error("A vault needs a password or a passkey.")
      const dataKey = random(32)
      const p = unlockWith.passkey
      await writeVault({
        v: 1,
        dataKey: {
          byPassword: unlockWith.password ? await wrapForPassword(dataKey, unlockWith.password) : undefined,
          byTouchId: p ? { ...(await seal(p.kek, dataKey)), credentialId: p.credentialId, prfSalt: p.prfSalt } : undefined,
        },
      })
      await startSession(dataKey)
    },

    unlockWithPassword,

    async unlockWithPasskey(kek: CryptoKey) {
      const w = (await readVault())?.dataKey.byTouchId
      if (!w) throw new Error("No passkey is set up for this wallet.")
      await startSession(await open(kek, w))
    },

    lock: () => backend.remove("session", SESSION),

    /** Keeps an unlocked session alive while the user is active. */
    async touch() {
      const s = await readSession()
      if (s) await backend.write("session", SESSION, { ...s, lastActive: Date.now() })
    },

    /** Sets or replaces the password. With an existing password, `current` must match it. */
    async setPassword(next: string, current?: string) {
      const vault = await readVault()
      if (vault?.dataKey.byPassword) {
        if (current === undefined) throw new Error("Enter the current password.")
        await unlockWithPassword(current)
      }
      const { s, vault: v } = await unlocked()
      await writeVault({ ...v, dataKey: { ...v.dataKey, byPassword: await wrapForPassword(fromHex(s.dataKey), next) } })
    },

    async addPasskey(p: PasskeyKey) {
      const { s, vault } = await unlocked()
      await writeVault({
        ...vault,
        dataKey: { ...vault.dataKey, byTouchId: { ...(await seal(p.kek, fromHex(s.dataKey))), credentialId: p.credentialId, prfSalt: p.prfSalt } },
      })
    },

    async removePasskey() {
      const vault = await readVault()
      if (!vault) return
      if (!vault.dataKey.byPassword) throw new Error("Set a password first, or you'd have no way to unlock.")
      await writeVault({ ...vault, dataKey: { byPassword: vault.dataKey.byPassword } })
    },

    passkey: async () => (await readVault())?.dataKey.byTouchId,
    hasPassword: async () => !!(await readVault())?.dataKey.byPassword,
    onChange: (listener: () => void) => backend.subscribe(listener),
  }
}

export type VaultApi = ReturnType<typeof makeVault>

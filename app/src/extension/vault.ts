import type { Hex } from "viem"
import type { KeyStore } from "@/lib/keystore"

/**
 * The extension's encrypted key store. A random data key encrypts the Falcon seed; the data key itself is wrapped
 * once per way of unlocking (password today, Touch ID when the browser supports WebAuthn PRF). Unlocking puts the
 * data key in chrome.storage.session: memory only, gone on browser restart, invisible to content scripts.
 */

export interface Sealed {
  iv: Hex
  ct: Hex
}
interface PasswordWrap extends Sealed {
  salt: Hex
  iterations: number
}
export interface TouchIdWrap extends Sealed {
  credentialId: string
  prfSalt: Hex
}
interface Vault {
  v: 1
  dataKey: { byPassword: PasswordWrap; byTouchId?: TouchIdWrap }
  seed?: Sealed
  pendingSeed?: Sealed
}
interface Session {
  dataKey: Hex
  lastActive: number
}

const VAULT = "eyrie.vault"
const SESSION = "eyrie.session"
const PBKDF2_ITERATIONS = 600_000
export const AUTO_LOCK_MS = 15 * 60 * 1000

export const toHex = (b: ArrayBuffer | Uint8Array): Hex =>
  `0x${Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("")}` as Hex
export const fromHex = (h: Hex): Uint8Array<ArrayBuffer> => Uint8Array.from(h.slice(2).match(/../g) ?? [], (x) => parseInt(x, 16))
export const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

const aes = (raw: Uint8Array<ArrayBuffer>) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"])

async function seal(key: CryptoKey, plain: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const iv = random(12)
  return { iv: toHex(iv), ct: toHex(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain)) }
}
const open = async (key: CryptoKey, s: Sealed) =>
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

const readVault = async () => (await chrome.storage.local.get(VAULT))[VAULT] as Vault | undefined
const writeVault = (v: Vault) => chrome.storage.local.set({ [VAULT]: v })
const readSession = async () => (await chrome.storage.session.get(SESSION))[SESSION] as Session | undefined
const startSession = (dataKey: Uint8Array) => chrome.storage.session.set({ [SESSION]: { dataKey: toHex(dataKey), lastActive: Date.now() } satisfies Session })

export type VaultState = "none" | "locked" | "unlocked"

export async function vaultState(): Promise<VaultState> {
  if (!(await readVault())) return "none"
  const s = await readSession()
  return s && Date.now() - s.lastActive < AUTO_LOCK_MS ? "unlocked" : "locked"
}

/** Creates an empty vault behind `password` and leaves it unlocked. */
export async function createVault(password: string) {
  const dataKey = random(32)
  await writeVault({ v: 1, dataKey: { byPassword: await wrapForPassword(dataKey, password) } })
  await startSession(dataKey)
}

export async function unlockWithPassword(password: string) {
  const vault = await readVault()
  if (!vault) throw new Error("There's no Eyrie wallet in this browser yet.")
  const w = vault.dataKey.byPassword
  let dataKey: Uint8Array
  try {
    dataKey = await open(await passwordKey(password, fromHex(w.salt), w.iterations), w)
  } catch {
    throw new Error("Wrong password.")
  }
  await startSession(dataKey)
}

/** Unlocks with a key derived elsewhere (Touch ID's PRF output). */
export async function unlockWithKey(kek: CryptoKey) {
  const vault = await readVault()
  if (!vault?.dataKey.byTouchId) throw new Error("Touch ID isn't set up for this wallet.")
  await startSession(await open(kek, vault.dataKey.byTouchId))
}

export const lock = () => chrome.storage.session.remove(SESSION)

/** Keeps an unlocked session alive while the user is active. */
export async function touch() {
  const s = await readSession()
  if (s && Date.now() - s.lastActive < AUTO_LOCK_MS) await chrome.storage.session.set({ [SESSION]: { ...s, lastActive: Date.now() } })
}

async function unlockedKey(): Promise<CryptoKey | null> {
  const s = await readSession()
  if (!s || Date.now() - s.lastActive >= AUTO_LOCK_MS) return null
  return aes(fromHex(s.dataKey))
}

export async function changePassword(current: string, next: string) {
  await unlockWithPassword(current)
  const vault = (await readVault())!
  const s = (await readSession())!
  await writeVault({ ...vault, dataKey: { ...vault.dataKey, byPassword: await wrapForPassword(fromHex(s.dataKey), next) } })
}

/** Adds a second wrap of the data key, under a key derived from Touch ID. Requires an unlocked vault. */
export async function addTouchIdWrap(kek: CryptoKey, credentialId: string, prfSalt: Hex) {
  const vault = await readVault()
  const s = await readSession()
  if (!vault || !s) throw new Error("Unlock the wallet first.")
  await writeVault({ ...vault, dataKey: { ...vault.dataKey, byTouchId: { ...(await seal(kek, fromHex(s.dataKey))), credentialId, prfSalt } } })
}

export async function removeTouchIdWrap() {
  const vault = await readVault()
  if (!vault) return
  const { byPassword } = vault.dataKey
  await writeVault({ ...vault, dataKey: { byPassword } })
}

export const touchIdWrap = async () => (await readVault())?.dataKey.byTouchId

/** Fires whenever the vault locks, unlocks or changes, in any extension page. */
export function onVaultChange(listener: () => void) {
  const handler = (changes: Record<string, unknown>) => {
    if (VAULT in changes || SESSION in changes) listener()
  }
  chrome.storage.onChanged.addListener(handler)
  return () => chrome.storage.onChanged.removeListener(handler)
}

async function sealField(field: "seed" | "pendingSeed", value: Hex | null) {
  const key = await unlockedKey()
  if (!key) throw new Error("The wallet is locked.")
  const vault = (await readVault())!
  const next = { ...vault }
  if (value) next[field] = await seal(key, fromHex(value))
  else delete next[field]
  await writeVault(next)
}

async function openField(field: "seed" | "pendingSeed"): Promise<Hex | null> {
  const [vault, key] = await Promise.all([readVault(), unlockedKey()])
  const sealed = vault?.[field]
  if (!sealed || !key) return null
  return toHex(await open(key, sealed))
}

export const vaultKeyStore: KeyStore = {
  seed: () => openField("seed"),
  save: (seed) => sealField("seed", seed),
  pending: { get: () => openField("pendingSeed"), set: (seed) => sealField("pendingSeed", seed) },
  clear: async () => {
    await chrome.storage.local.remove(VAULT)
    await lock()
  },
}

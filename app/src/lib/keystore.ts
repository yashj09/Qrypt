import type { Hex } from "viem"

/**
 * Where the Falcon seed lives. The web app keeps it in localStorage; the extension keeps it in an encrypted vault
 * that can be locked, so every read is async and may come back null.
 */
export interface KeyStore {
  /** The current seed, or null when there is none yet or the store is locked. */
  seed(): Promise<Hex | null>
  save(seed: Hex): Promise<void>
  /** A rotation's new seed, parked until the rotation lands onchain. */
  pending: { get(): Promise<Hex | null>; set(seed: Hex | null): Promise<void> }
  clear(): Promise<void>
}

const SEED_KEY = "qpay.falconSeed"
const PENDING_KEY = "qpay.pendingSeed"

export const localStorageKeyStore: KeyStore = {
  seed: async () => localStorage.getItem(SEED_KEY) as Hex | null,
  save: async (seed) => localStorage.setItem(SEED_KEY, seed),
  pending: {
    get: async () => localStorage.getItem(PENDING_KEY) as Hex | null,
    set: async (seed) => (seed ? localStorage.setItem(PENDING_KEY, seed) : localStorage.removeItem(PENDING_KEY)),
  },
  clear: async () => {
    localStorage.removeItem(SEED_KEY)
    localStorage.removeItem(PENDING_KEY)
  },
}

let active: KeyStore = localStorageKeyStore

/** Each entry point (web app, extension pages) picks its store once, before rendering. */
export const setKeyStore = (store: KeyStore) => {
  active = store
}
export const keyStore = () => active

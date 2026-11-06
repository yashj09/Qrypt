import { extensionVault as v } from "@/lib/vault/chrome"
import type { PasskeyKey } from "@/lib/vault/core"

/** The extension's vault: the shared vault core on chrome.storage. Names kept for the extension's pages. */
export { AUTO_LOCK_MS, fromHex, random, toHex, type VaultState } from "@/lib/vault/core"

export const vaultKeyStore = v.keyStore
export const vaultState = () => v.state()
export const createVault = (password: string) => v.create({ password })
export const unlockWithPassword = (password: string) => v.unlockWithPassword(password)
export const unlockWithKey = (kek: CryptoKey) => v.unlockWithPasskey(kek)
export const lock = () => v.lock()
export const touch = () => v.touch()
export const changePassword = (current: string, next: string) => v.setPassword(next, current)
export const addTouchIdWrap = (key: PasskeyKey) => v.addPasskey(key)
export const removeTouchIdWrap = () => v.removePasskey()
export const touchIdWrap = () => v.passkey()
export const onVaultChange = (listener: () => void) => v.onChange(listener)

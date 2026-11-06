import { makeVault, type VaultBackend } from "./core"

/** chrome.storage: `local` survives restarts; `session` is memory only and hidden from content scripts. */
const chromeBackend: VaultBackend = {
  read: async <T,>(area: "local" | "session", key: string) => (await chrome.storage[area].get(key))[key] as T | undefined,
  write: (area, key, value) => chrome.storage[area].set({ [key]: value }),
  remove: (area, key) => chrome.storage[area].remove(key),
  subscribe(listener) {
    const handler = () => listener()
    chrome.storage.onChanged.addListener(handler)
    return () => chrome.storage.onChanged.removeListener(handler)
  },
}

export const extensionVault = makeVault(chromeBackend)

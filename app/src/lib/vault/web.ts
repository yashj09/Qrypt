import { makeVault, type VaultBackend } from "./core"

/**
 * localStorage holds the sealed vault; sessionStorage holds the unlocked data key, so a reload keeps you unlocked but
 * closing the tab (or 15 idle minutes) locks. Other tabs hear about changes through the storage event.
 */
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
const area = (a: "local" | "session") => (a === "local" ? localStorage : sessionStorage)

const webBackend: VaultBackend = {
  read: async <T,>(a: "local" | "session", key: string) => {
    const raw = area(a).getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  },
  write: async (a, key, value) => {
    area(a).setItem(key, JSON.stringify(value))
    notify()
  },
  remove: async (a, key) => {
    area(a).removeItem(key)
    notify()
  },
  subscribe(listener) {
    listeners.add(listener)
    window.addEventListener("storage", listener)
    return () => {
      listeners.delete(listener)
      window.removeEventListener("storage", listener)
    }
  },
}

export const webVault = makeVault(webBackend)

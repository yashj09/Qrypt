import { useEffect, useSyncExternalStore } from "react"

/** Registers the notification-only service worker (see public/sw.js). */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return
  navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("service worker:", e))
}

/** Sets the browser chrome colour, so the status bar matches the light site or the dark phone wallet. */
export function setThemeColor(color: string) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color)
}

/** Wallet pages are dark, like the extension; the landing page they share index.html with stays light. */
export function useDarkWallet() {
  useEffect(() => {
    document.documentElement.classList.add("dark")
    setThemeColor("#0c0d0f")
    return () => {
      document.documentElement.classList.remove("dark")
      setThemeColor("#f9f7f3")
    }
  }, [])
}

// Chromium (Android, desktop) offers an install prompt we can trigger from a button. iOS has none: see InstallGuide.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault() // we show our own "Install Qrypt" button instead of Chrome's mini-infobar
  deferred = e as InstallPromptEvent
  emit()
})
window.addEventListener("appinstalled", () => {
  deferred = null
  emit()
})

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

async function install() {
  if (!deferred) return
  await deferred.prompt()
  await deferred.userChoice
  deferred = null
  emit()
}

/** `install` when the browser will show its install dialog, else null. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  return useSyncExternalStore(subscribe, () => (deferred ? install : null))
}

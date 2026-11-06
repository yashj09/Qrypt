import { StrictMode, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { MotionConfig } from "motion/react"
import { setKeyStore } from "@/lib/keystore"
import { applyRemoteConfig } from "@/lib/qpay"
import { vaultKeyStore } from "./vault"
import "@/index.css"

/** Every extension page: the vault is the key store, endpoints come from the server, dark theme. */
export async function mount(page: ReactNode) {
  setKeyStore(vaultKeyStore)
  await applyRemoteConfig()
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">{page}</MotionConfig>
    </StrictMode>,
  )
}

export const openFullscreen = (hash = "") => chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${hash}`) })
export const openOnboarding = () => chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") })

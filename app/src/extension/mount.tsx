import { StrictMode, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { MotionConfig } from "motion/react"
import "@/index.css"

/** Every extension page mounts the same way: dark theme, reduced motion respected. */
export function mount(page: ReactNode) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">{page}</MotionConfig>
    </StrictMode>,
  )
}

export const openFullscreen = (hash = "") => chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${hash}`) })

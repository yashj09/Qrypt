import { StrictMode, Suspense, lazy } from "react"
import { createRoot } from "react-dom/client"
import { MotionConfig } from "motion/react"

import "./index.css"
import Landing from "@/routes/landing"

/** Every route but the landing page is lazy, so the landing page ships no viem or Falcon code. */
const ROUTES: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  "/app": lazy(() => import("@/routes/app")),
  "/connect": lazy(() => import("@/routes/connect")),
  "/dapp": lazy(() => import("@/routes/dapp")),
}

const Page = ROUTES[window.location.pathname.replace(/\/+$/, "")]

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      {Page ? (
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      ) : (
        <Landing />
      )}
    </MotionConfig>
  </StrictMode>
)

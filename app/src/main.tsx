import { StrictMode, Suspense, lazy } from "react"
import { createRoot } from "react-dom/client"
import { MotionConfig } from "motion/react"

import "./index.css"
import Landing from "@/routes/landing"

const AppPage = lazy(() => import("@/routes/app"))
const isApp = window.location.pathname.replace(/\/+$/, "") === "/app"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      {isApp ? (
        <Suspense fallback={null}>
          <AppPage />
        </Suspense>
      ) : (
        <Landing />
      )}
    </MotionConfig>
  </StrictMode>
)

import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * Builds the extension's pages (popup, fullscreen dashboard, onboarding, dapp approval) from the same `src` as the
 * website into extension/dist, next to the static files (manifest, background worker, content scripts).
 */
const PAGES = resolve(import.meta.dirname, "src/extension")

export default defineConfig({
  root: PAGES,
  base: "",
  publicDir: resolve(import.meta.dirname, "../extension/static"),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "./src") } },
  define: {
    "import.meta.env.VITE_API_BASE": JSON.stringify(process.env.VITE_API_BASE ?? "https://qpay-psi.vercel.app"),
  },
  build: {
    outDir: resolve(import.meta.dirname, "../extension/dist"),
    emptyOutDir: true,
    // MV3 pages forbid inline scripts; keep everything in files.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        popup: resolve(PAGES, "popup.html"),
        dashboard: resolve(PAGES, "dashboard.html"),
        onboarding: resolve(PAGES, "onboarding.html"),
        approve: resolve(PAGES, "approve.html"),
      },
    },
  },
})

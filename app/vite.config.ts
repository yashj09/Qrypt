import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const ROOT = resolve(import.meta.dirname, "..")

/** Serves api/onboard.ts under `vite dev`, so local runs use the same handler Vercel deploys. */
function devOnboarding(): Plugin {
  return {
    name: "qpay-dev-onboarding",
    configureServer(server) {
      const operatorKeyFile = resolve(ROOT, ".qpay/deployer.hex")
      if (!process.env.ONBOARD_KEY && existsSync(operatorKeyFile)) {
        process.env.ONBOARD_KEY = readFileSync(operatorKeyFile, "utf8").trim()
      }
      server.middlewares.use("/api/onboard", async (req, res) => {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const { POST } = await server.ssrLoadModule("/api/onboard.ts")
        const response: Response = await POST(
          new Request("http://localhost/api/onboard", { method: req.method, body: Buffer.concat(chunks), headers: { "content-type": "application/json" } }),
        )
        res.statusCode = response.status
        res.setHeader("content-type", "application/json")
        res.end(await response.text())
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devOnboarding()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    fs: { allow: [ROOT] },
  },
})

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const ROOT = resolve(import.meta.dirname, "..")

/** Loads KEY=VALUE lines (from `vercel env pull`) without overriding what's already set. */
function loadEnvFile(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

/** Serves api/*.ts under `vite dev` with the same Web handlers Vercel deploys (GET/POST/PUT exports). */
function devApi(): Plugin {
  return {
    name: "qrypt-dev-api",
    configureServer(server) {
      const operatorKeyFile = resolve(ROOT, ".qpay/deployer.hex")
      if (!process.env.ONBOARD_KEY && existsSync(operatorKeyFile)) {
        process.env.ONBOARD_KEY = readFileSync(operatorKeyFile, "utf8").trim()
      }
      loadEnvFile(resolve(ROOT, ".env.local"))
      server.middlewares.use("/api", async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost")
        const name = url.pathname.replace(/^\/+|\/+$/g, "")
        if (!/^[a-z-]+$/.test(name) || !existsSync(resolve(import.meta.dirname, `api/${name}.ts`))) return next()
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const handlers = await server.ssrLoadModule(`/api/${name}.ts`)
        const handler = handlers[req.method ?? "GET"]
        if (!handler) {
          res.statusCode = 405
          return res.end()
        }
        const hasBody = req.method !== "GET" && req.method !== "HEAD"
        // Forward the caller's headers like Vercel does (functions read e.g. x-qrypt-test-key), minus hop-by-hop ones.
        const headers = new Headers({ "content-type": "application/json" })
        for (const [key, value] of Object.entries(req.headers)) {
          if (value === undefined || ["host", "connection", "content-length", "transfer-encoding"].includes(key)) continue
          headers.set(key, Array.isArray(value) ? value.join(", ") : value)
        }
        const response: Response = await handler(
          new Request(`http://localhost/api/${name}${url.search}`, {
            method: req.method,
            body: hasBody ? Buffer.concat(chunks) : undefined,
            headers,
          }),
        )
        res.statusCode = response.status
        res.setHeader("content-type", response.headers.get("content-type") ?? "application/json")
        res.end(await response.text())
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    fs: { allow: [ROOT] },
  },
})

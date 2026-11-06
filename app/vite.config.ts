import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const NODE_RPC = process.env.QPAY_NODE_RPC ?? "http://127.0.0.1:32002"
const ALT_RPC = process.env.QPAY_ALT_RPC ?? "http://127.0.0.1:14337/rpc/"

const proxyTo = (target: string) => ({
  target,
  changeOrigin: true,
  rewrite: () => new URL(target).pathname,
})

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    fs: { allow: [resolve(import.meta.dirname, "..")] },
    proxy: { "/node": proxyTo(NODE_RPC), "/alt": proxyTo(ALT_RPC) },
  },
})

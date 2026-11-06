import type { EyrieRequest, EyrieResponse, PopupMessage } from "@/lib/connect/protocol"

/** Where the approval page gets its one request from, and where its answer goes. */
export interface Channel {
  kind: "popup" | "extension"
  request: Promise<EyrieRequest>
  respond(response: EyrieResponse): void
}

interface ChromeRuntime {
  sendMessage(extensionId: string, message: unknown, callback?: (reply: unknown) => void): void
  lastError?: { message?: string }
}

const chromeRuntime = () => (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime

/** The dapp opened us with window.open; the browser tells us its real origin with each message. */
function popupChannel(): Channel | null {
  const opener = window.opener as Window | null
  if (!opener) return null
  let origin = ""
  const request = new Promise<EyrieRequest>((resolve) => {
    const onMessage = (event: MessageEvent<PopupMessage>) => {
      if (event.source !== opener || event.data?.type !== "eyrie:request") return
      window.removeEventListener("message", onMessage)
      origin = event.origin
      resolve({ ...event.data.request, origin })
    }
    window.addEventListener("message", onMessage)
  })
  const ready: PopupMessage = { type: "eyrie:ready" }
  opener.postMessage(ready, "*")
  return {
    kind: "popup",
    request,
    respond(response) {
      const message: PopupMessage = { type: "eyrie:response", response }
      opener.postMessage(message, origin)
    },
  }
}

/** The Eyrie extension opened us; it holds the request and set its origin from the requesting tab's URL. */
function extensionChannel(extensionId: string, rid: string): Channel | null {
  const runtime = chromeRuntime()
  if (!runtime) return null
  const request = new Promise<EyrieRequest>((resolve, reject) =>
    runtime.sendMessage(extensionId, { type: "eyrie:get", rid }, (reply) => {
      const r = reply as { request?: EyrieRequest } | undefined
      if (r?.request) resolve(r.request)
      else reject(new Error(runtime.lastError?.message ?? "The extension has no pending request."))
    }),
  )
  return {
    kind: "extension",
    request,
    respond: (response) => runtime.sendMessage(extensionId, { type: "eyrie:respond", rid, response }),
  }
}

export function channelFromLocation(): Channel | null {
  const q = new URLSearchParams(window.location.search)
  if (q.get("transport") === "extension") {
    const ext = q.get("ext")
    const rid = q.get("rid")
    return ext && rid ? extensionChannel(ext, rid) : null
  }
  return popupChannel()
}

import type { QryptRequest, QryptResponse, PopupMessage } from "@/lib/connect/protocol"

/** Where the approval page gets its one request from, and where its answer goes. */
export interface Channel {
  kind: "popup" | "extension"
  request: Promise<QryptRequest>
  respond(response: QryptResponse): void
}

/** The dapp opened us with window.open; the browser tells us its real origin with each message. */
export function popupChannel(): Channel | null {
  const opener = window.opener as Window | null
  if (!opener) return null
  let origin = ""
  const request = new Promise<QryptRequest>((resolve) => {
    const onMessage = (event: MessageEvent<PopupMessage>) => {
      if (event.source !== opener || event.data?.type !== "qrypt:request") return
      window.removeEventListener("message", onMessage)
      origin = event.origin
      resolve({ ...event.data.request, origin })
    }
    window.addEventListener("message", onMessage)
  })
  const ready: PopupMessage = { type: "qrypt:ready" }
  opener.postMessage(ready, "*")
  return {
    kind: "popup",
    request,
    respond(response) {
      const message: PopupMessage = { type: "qrypt:response", response }
      opener.postMessage(message, origin)
    },
  }
}

/** The extension's own approval window: the background worker holds the request and set its origin from the tab. */
export function extensionChannel(rid: string): Channel {
  const request = chrome.runtime.sendMessage({ type: "qrypt:get", rid }).then((reply: { request?: QryptRequest } | undefined) => {
    if (!reply?.request) throw new Error("This request has expired. Try again from the dapp.")
    return reply.request
  })
  return {
    kind: "extension",
    request,
    respond: (response) => void chrome.runtime.sendMessage({ type: "qrypt:respond", rid, response }),
  }
}

export const channelFromLocation = (): Channel | null => popupChannel()

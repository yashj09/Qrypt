import {
  CHAIN_ID,
  CHAIN_ID_HEX,
  UNSUPPORTED_CHAIN,
  USER_REJECTED,
  isApprovalMethod,
  type QryptResponse,
  type PopupMessage,
  type RpcError,
} from "@/lib/connect/protocol"

export interface RequestArguments {
  method: string
  params?: unknown[]
}

type Listener = (...args: unknown[]) => void

export interface Eip1193Provider {
  request(args: RequestArguments): Promise<unknown>
  on(event: string, listener: Listener): void
  removeListener(event: string, listener: Listener): void
}

export class ProviderRpcError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

const fail = (e: RpcError) => new ProviderRpcError(e.code, e.message)

/**
 * An EIP-1193 provider that needs nothing installed. Approvals open the wallet's `/connect` page in a popup, so the
 * Falcon key never leaves the wallet's origin. The popup must open inside the user's click, so `request` opens it
 * before its first `await`.
 */
export function createQryptPopupProvider({ walletUrl, rpcUrl }: { walletUrl: string; rpcUrl: string }): Eip1193Provider {
  const walletOrigin = new URL(walletUrl).origin
  const listeners = new Map<string, Set<Listener>>()
  const emit = (event: string, ...args: unknown[]) => listeners.get(event)?.forEach((l) => l(...args))
  let accounts: string[] = []

  const read = async (method: string, params: unknown[] = []) => {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
    const body = (await res.json()) as { result?: unknown; error?: RpcError }
    if (body.error) throw fail(body.error)
    return body.result
  }

  const approve = (method: string, params: unknown[]): Promise<unknown> => {
    const popup = window.open(`${walletUrl}/connect?transport=popup`, "qrypt-connect", "width=440,height=720")
    if (!popup) return Promise.reject(new ProviderRpcError(4100, "The browser blocked the Qrypt popup. Allow popups and try again."))
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const done = () => {
        window.removeEventListener("message", onMessage)
        clearInterval(closedPoll)
      }
      const onMessage = (event: MessageEvent<PopupMessage>) => {
        if (event.origin !== walletOrigin || event.source !== popup) return
        if (event.data.type === "qrypt:ready") {
          const message: PopupMessage = { type: "qrypt:request", request: { id, method: method as never, params } }
          popup.postMessage(message, walletOrigin)
        }
        if (event.data.type === "qrypt:response" && event.data.response.id === id) {
          done()
          const response: QryptResponse = event.data.response
          if ("error" in response) reject(fail(response.error))
          else resolve(response.result)
        }
      }
      const closedPoll = setInterval(() => {
        if (popup.closed) {
          done()
          reject(fail(USER_REJECTED))
        }
      }, 400)
      window.addEventListener("message", onMessage)
    })
  }

  return {
    async request({ method, params = [] }) {
      if (method === "eth_chainId") return CHAIN_ID_HEX
      if (method === "net_version") return String(CHAIN_ID)
      if (method === "eth_accounts") return accounts
      if (method === "wallet_switchEthereumChain") {
        const [{ chainId }] = params as [{ chainId: string }]
        if (chainId.toLowerCase() === CHAIN_ID_HEX) return null
        throw fail(UNSUPPORTED_CHAIN)
      }
      if (isApprovalMethod(method)) {
        const result = await approve(method, params)
        if (method === "eth_requestAccounts") {
          accounts = result as string[]
          emit("accountsChanged", accounts)
          emit("connect", { chainId: CHAIN_ID_HEX })
        }
        return result
      }
      return read(method, params)
    },
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(listener)
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener)
    },
  }
}

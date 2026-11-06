// Answers reads from the node, and sends approvals to the Eyrie web wallet's /connect page in a popup window.
// The page talks back through externally_connectable, so keys never leave the wallet's own origin.
const WALLET = "https://qpay-psi.vercel.app"
const LOCAL_WALLET = "http://localhost:5180"
const RPC = "https://altmempool.forshtat.com"
const CHAIN_ID_HEX = "0x539"
const APPROVAL = new Set(["eth_requestAccounts", "eth_sendTransaction", "personal_sign", "eth_signTypedData_v4"])
const REJECTED = { code: 4001, message: "User rejected the request." }

/** rid -> { resolve, windowId }. The request itself lives in session storage, so /connect can fetch it by rid. */
const waiting = new Map()

const walletUrl = async () => ((await chrome.storage.local.get("useLocal")).useLocal ? LOCAL_WALLET : WALLET)
const connectedSites = async () => (await chrome.storage.local.get("connected")).connected ?? {}

async function read(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  const body = await res.json()
  return body.error ? { error: body.error } : { result: body.result }
}

async function approve(origin, method, params) {
  const rid = crypto.randomUUID()
  await chrome.storage.session.set({ [`req:${rid}`]: { id: rid, origin, method, params } })
  const url = `${await walletUrl()}/connect?transport=extension&ext=${chrome.runtime.id}&rid=${rid}`
  const win = await chrome.windows.create({ url, type: "popup", width: 440, height: 720 })
  const reply = await new Promise((resolve) => waiting.set(rid, { resolve, windowId: win.id }))
  await chrome.storage.session.remove(`req:${rid}`)
  if (method === "eth_requestAccounts" && reply.result?.[0]) {
    await chrome.storage.local.set({ connected: { ...(await connectedSites()), [origin]: reply.result[0] } })
  }
  return reply
}

async function handle(origin, method, params) {
  if (method === "eth_chainId") return { result: CHAIN_ID_HEX }
  if (method === "net_version") return { result: "1337" }
  if (method === "eth_accounts") {
    const account = (await connectedSites())[origin]
    return { result: account ? [account] : [] }
  }
  if (method === "wallet_switchEthereumChain") {
    return params?.[0]?.chainId?.toLowerCase() === CHAIN_ID_HEX
      ? { result: null }
      : { error: { code: 4902, message: "Eyrie only runs on the EIP-8141 devnet (chain 1337)." } }
  }
  if (APPROVAL.has(method)) return approve(origin, method, params)
  return read(method, params)
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "eyrie-rpc") return
  const origin = new URL(port.sender.url).origin
  port.onMessage.addListener(async ({ method, params }) => {
    let reply
    try {
      reply = await handle(origin, method, params ?? [])
    } catch (e) {
      reply = { error: { code: -32603, message: String(e?.message ?? e) } }
    }
    try {
      port.postMessage(reply)
    } catch {
      // The tab went away while the user decided.
    }
  })
})

chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "eyrie:get") {
    chrome.storage.session.get(`req:${msg.rid}`).then((s) => sendResponse({ request: s[`req:${msg.rid}`] }))
    return true
  }
  if (msg?.type === "eyrie:respond") {
    const w = waiting.get(msg.rid)
    waiting.delete(msg.rid)
    w?.resolve("error" in msg.response ? { error: msg.response.error } : { result: msg.response.result })
    sendResponse({ ok: !!w })
  }
})

chrome.windows.onRemoved.addListener((windowId) => {
  for (const [rid, w] of waiting) {
    if (w.windowId === windowId) {
      waiting.delete(rid)
      w.resolve({ error: REJECTED })
    }
  }
})

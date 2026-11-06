// The wallet's background worker. Reads go to the node; approvals open the extension's own approval window, which
// holds the Falcon key (through the vault) and answers over internal messages.
const RPC = "https://altmempool.forshtat.com"
const CHAIN_ID_HEX = "0x539"
const APPROVAL = new Set(["eth_requestAccounts", "eth_sendTransaction", "personal_sign", "eth_signTypedData_v4"])
const REJECTED = { code: 4001, message: "User rejected the request." }

/** rid -> { resolve, windowId }. The request lives in session storage, so the approval window can fetch it by rid. */
const waiting = new Map()

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
  const url = chrome.runtime.getURL(`approve.html?rid=${rid}`)
  const win = await chrome.windows.create({ url, type: "popup", width: 420, height: 680 })
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

// Only the extension's own pages can send these (no externally_connectable), so the approval window is trusted.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL("approve.html"))) return
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

// Session and timing must match app/src/extension/vault.ts.
const SESSION = "eyrie.session"
const AUTO_LOCK_MS = 15 * 60 * 1000

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") })
})

chrome.alarms.create("autolock", { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "autolock") return
  const { [SESSION]: session } = await chrome.storage.session.get(SESSION)
  if (session && Date.now() - session.lastActive >= AUTO_LOCK_MS) await chrome.storage.session.remove(SESSION)
})

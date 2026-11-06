// Runs in the page's own world: the EIP-1193 provider dapps call, announced through EIP-6963.
(() => {
  if (window.eyrie) return
  const CHANNEL = "eyrie-extension"
  const ICON =
    "data:image/svg+xml;base64," +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#1c1b18"/><g fill="#f7f5f0" transform="translate(2.4 2.2) scale(0.8)"><circle cx="12" cy="10.2" r="3.6"/><circle cx="3.5" cy="8.5" r="1.35"/><circle cx="20.5" cy="8.5" r="1.35"/><circle cx="4.6" cy="13" r="1.35"/><circle cx="19.4" cy="13" r="1.35"/><circle cx="7.4" cy="16.8" r="1.35"/><circle cx="16.6" cy="16.8" r="1.35"/><circle cx="12" cy="18.6" r="1.35"/></g></svg>',
    )
  const target = window.location.origin === "null" ? "*" : window.location.origin
  const pending = new Map()
  const listeners = new Map()
  let nextId = 0

  const emit = (event, ...args) => (listeners.get(event) || []).forEach((l) => l(...args))

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.channel !== CHANNEL || e.data.dir !== "to-page") return
    const p = pending.get(e.data.id)
    if (!p) return
    pending.delete(e.data.id)
    if (e.data.error) p.reject(Object.assign(new Error(e.data.error.message), { code: e.data.error.code }))
    else p.resolve(e.data.result)
  })

  const provider = {
    isEyrie: true,
    request({ method, params = [] }) {
      const id = ++nextId
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        window.postMessage({ channel: CHANNEL, dir: "to-extension", id, method, params }, target)
      }).then((result) => {
        if (method === "eth_requestAccounts") {
          emit("connect", { chainId: "0x539" })
          emit("accountsChanged", result)
        }
        return result
      })
    },
    on(event, listener) {
      listeners.set(event, [...(listeners.get(event) || []), listener])
      return provider
    },
    removeListener(event, listener) {
      listeners.set(event, (listeners.get(event) || []).filter((l) => l !== listener))
      return provider
    },
  }

  const info = Object.freeze({ uuid: crypto.randomUUID(), name: "Eyrie", icon: ICON, rdns: "app.eyrie.wallet" })
  const announce = () =>
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }))
  window.addEventListener("eip6963:requestProvider", announce)
  announce()

  window.eyrie = provider
  if (!window.ethereum) Object.defineProperty(window, "ethereum", { value: provider, configurable: true })
})()

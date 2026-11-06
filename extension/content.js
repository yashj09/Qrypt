// Isolated world: relays the page provider's requests to the background worker, one port per request.
// An open port also keeps the worker alive while the user is deciding.
const CHANNEL = "eyrie-extension"
const target = window.location.origin === "null" ? "*" : window.location.origin

window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.channel !== CHANNEL || e.data.dir !== "to-extension") return
  const { id, method, params } = e.data
  const reply = (body) => window.postMessage({ channel: CHANNEL, dir: "to-page", id, ...body }, target)
  let answered = false
  const port = chrome.runtime.connect({ name: "eyrie-rpc" })
  port.onMessage.addListener((msg) => {
    answered = true
    reply(msg)
    port.disconnect()
  })
  port.onDisconnect.addListener(() => {
    if (!answered) reply({ error: { code: 4900, message: "The Eyrie extension stopped responding. Try again." } })
  })
  port.postMessage({ method, params })
})

const WALLET = "https://qpay-psi.vercel.app"
const LOCAL_WALLET = "http://localhost:5180"

async function render() {
  const { connected = {}, useLocal = false } = await chrome.storage.local.get(["connected", "useLocal"])
  document.getElementById("local").checked = useLocal
  const list = document.getElementById("sites")
  list.replaceChildren()
  const sites = Object.entries(connected)
  if (sites.length === 0) {
    const li = document.createElement("li")
    li.textContent = "None yet"
    list.append(li)
  }
  for (const [origin, account] of sites) {
    const li = document.createElement("li")
    const label = document.createElement("span")
    label.textContent = `${new URL(origin).host} · ${account.slice(0, 6)}…${account.slice(-4)}`
    const remove = Object.assign(document.createElement("button"), { className: "ghost", textContent: "Disconnect" })
    remove.onclick = async () => {
      const { connected: c = {} } = await chrome.storage.local.get("connected")
      delete c[origin]
      await chrome.storage.local.set({ connected: c })
      render()
    }
    li.append(label, remove)
    list.append(li)
  }
}

document.getElementById("open").onclick = async () => {
  const { useLocal } = await chrome.storage.local.get("useLocal")
  chrome.tabs.create({ url: `${useLocal ? LOCAL_WALLET : WALLET}/app` })
}
document.getElementById("local").onchange = (e) => chrome.storage.local.set({ useLocal: e.target.checked }).then(render)
render()

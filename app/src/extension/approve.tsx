import { useMemo } from "react"
import ConnectPage from "@/routes/connect"
import { extensionChannel } from "@/lib/connect/channel"
import { VaultGate } from "./components/vault-gate"
import { mount } from "./mount"

/** The dapp approval window. A locked wallet asks for the password first, then shows the request. */
function Approve() {
  const channel = useMemo(() => {
    const rid = new URLSearchParams(window.location.search).get("rid")
    return rid ? extensionChannel(rid) : null
  }, [])
  return <ConnectPage channel={channel} />
}

void mount(
  <VaultGate>
    <Approve />
  </VaultGate>,
)

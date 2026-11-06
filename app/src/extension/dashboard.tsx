import { useEffect, useState } from "react"
import { GlobeIcon } from "lucide-react"
import { WalletDashboard } from "@/components/dashboard/wallet-dashboard"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { UnlockMethodsCard } from "@/components/vault/unlock-methods-card"
import { KeyCard } from "@/components/wallet/key-card"
import { useWallet } from "@/hooks/use-wallet"
import { short } from "@/lib/format"
import { extensionVault } from "@/lib/vault/chrome"
import { VaultGate } from "./components/vault-gate"
import { mount } from "./mount"
import { lock } from "./vault"

/** The extension's fullscreen tab: the shared dashboard, plus connected sites. */
function Dashboard() {
  const w = useWallet()
  const { busy, actions } = w
  return (
    <WalletDashboard
      w={w}
      onLock={() => void lock()}
      settings={
        <>
          <KeyCard busy={busy !== null} onBackup={actions.backup} onRotate={actions.rotate} onClose={actions.close} onForget={actions.forget} />
          <UnlockMethodsCard vault={extensionVault} />
        </>
      }
      extraSections={[{ id: "sites", label: "Connected sites", icon: GlobeIcon, render: () => <ConnectedSites /> }]}
    />
  )
}

function ConnectedSites() {
  const [sites, setSites] = useState<Record<string, string> | null>(null)
  const load = () => chrome.storage.local.get("connected").then((s) => setSites((s.connected as Record<string, string>) ?? {}))
  useEffect(() => {
    void load()
  }, [])
  const disconnect = async (origin: string) => {
    const { connected = {} } = (await chrome.storage.local.get("connected")) as { connected?: Record<string, string> }
    delete connected[origin]
    await chrome.storage.local.set({ connected })
    void load()
  }
  if (!sites) return null
  const entries = Object.entries(sites)
  return entries.length === 0 ? (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>No connected sites</EmptyTitle>
        <EmptyDescription>Dapps you connect to through Qrypt show up here.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ) : (
    <ItemGroup className="gap-2">
      {entries.map(([origin, address]) => (
        <Item key={origin} variant="outline">
          <ItemContent>
            <ItemTitle>{new URL(origin).host}</ItemTitle>
            <ItemDescription className="font-mono text-xs">{short(address, 6)}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="sm" onClick={() => void disconnect(origin)}>
              Disconnect
            </Button>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  )
}

void mount(
  <VaultGate>
    <Dashboard />
  </VaultGate>,
)

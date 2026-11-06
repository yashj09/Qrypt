import { useState, type ReactNode } from "react"
import { AlertCircleIcon, ArrowLeftIcon, HistoryIcon, LockIcon, Maximize2Icon, PlusIcon, SettingsIcon, WalletIcon } from "lucide-react"
import { LogoMark } from "@/components/brand/logo"
import { NetworkBadge } from "@/components/brand/network-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Activity } from "@/components/wallet/activity"
import { AddTokenDialog } from "@/components/wallet/add-token-dialog"
import { ReceiveDialog } from "@/components/wallet/receive-dialog"
import { SendCard } from "@/components/wallet/send-card"
import { TransferStatus } from "@/components/wallet/transfer-status"
import { useWallet } from "@/hooks/use-wallet"
import { assetKey } from "@/lib/assets"
import { AssetList } from "./components/asset-list"
import { BalanceHero } from "./components/balance-hero"
import { VaultGate } from "./components/vault-gate"
import { mount, openFullscreen, openOnboarding } from "./mount"
import { lock } from "./vault"

type Screen = "portfolio" | "send" | "activity" | "settings"

function Popup() {
  const { deployment, account, wallet, assets, fee, names, busy, run, activity, error, actions } = useWallet()
  const [screen, setScreen] = useState<Screen>("portfolio")
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [addTokenOpen, setAddTokenOpen] = useState(false)
  const back = <BackTo onClick={() => setScreen("portfolio")} />

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2">
          <LogoMark className="size-5" />
          <span className="text-sm font-semibold">Qrypt</span>
        </div>
        <div className="flex items-center gap-1">
          <NetworkBadge />
          <Button variant="ghost" size="icon-sm" aria-label="Lock" onClick={() => void lock()}>
            <LockIcon />
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        {error && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription className="line-clamp-3 break-all">{error}</AlertDescription>
          </Alert>
        )}
        {!account ? (
          <NoAccount />
        ) : screen === "portfolio" ? (
          <>
            <BalanceHero
              account={account}
              usdc={deployment ? wallet?.holdings[assetKey(assets[0])] : undefined}
              onSend={() => setScreen("send")}
              onReceive={() => setReceiveOpen(true)}
              onActivity={() => setScreen("activity")}
            />
            {run && <TransferStatus run={run} />}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Assets</span>
              <Button variant="ghost" size="xs" onClick={() => setAddTokenOpen(true)}>
                <PlusIcon data-icon="inline-start" />
                Add token
              </Button>
            </div>
            <AssetList assets={assets} holdings={wallet?.holdings ?? null} />
            <p className="pb-2 text-center text-xs text-muted-foreground">Gas is paid in USDC. You never need ETH.</p>
          </>
        ) : screen === "send" ? (
          <>
            {back}
            {run && <TransferStatus run={run} />}
            <SendCard
              assets={assets}
              holdings={wallet?.holdings ?? null}
              fee={fee}
              sending={busy === "send"}
              disabled={!deployment || busy !== null}
              onSend={actions.send}
            />
          </>
        ) : screen === "activity" ? (
          <>
            {back}
            <Activity local={activity} transfers={wallet?.transfers ?? null} names={names} />
          </>
        ) : (
          <SettingsScreen />
        )}
      </main>

      <nav className="grid shrink-0 grid-cols-4 border-t">
        <NavButton icon={<WalletIcon />} label="Wallet" active={screen === "portfolio" || screen === "send"} onClick={() => setScreen("portfolio")} />
        <NavButton icon={<HistoryIcon />} label="Activity" active={screen === "activity"} onClick={() => setScreen("activity")} />
        <NavButton icon={<Maximize2Icon />} label="Fullscreen" onClick={() => openFullscreen()} />
        <NavButton icon={<SettingsIcon />} label="Settings" active={screen === "settings"} onClick={() => setScreen("settings")} />
      </nav>

      {account && deployment && (
        <>
          <ReceiveDialog open={receiveOpen} onOpenChange={setReceiveOpen} account={account} chainId={deployment.chainId} assets={assets} />
          <AddTokenDialog open={addTokenOpen} onOpenChange={setAddTokenOpen} onAdd={actions.addToken} />
        </>
      )}
    </div>
  )
}

function NavButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active || undefined}
      className="flex h-14 flex-col items-center justify-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground data-active:text-foreground [&_svg]:size-5"
    >
      {icon}
      {label}
    </button>
  )
}

function BackTo({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="self-start" onClick={onClick}>
      <ArrowLeftIcon data-icon="inline-start" />
      Back
    </Button>
  )
}

function NoAccount() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">This wallet has no account yet.</p>
      <Button onClick={() => void openOnboarding()}>Set up an account</Button>
    </div>
  )
}

function SettingsScreen() {
  return (
    <ItemGroup className="gap-2">
      <Item variant="muted" size="sm">
        <ItemMedia variant="icon">
          <Maximize2Icon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Key, backup and connected sites</ItemTitle>
          <ItemDescription>Back up, rotate the key, close the account or manage sites in the fullscreen wallet.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="sm" variant="outline" onClick={() => void openFullscreen("#settings")}>
            Open
          </Button>
        </ItemActions>
      </Item>
      <Item variant="muted" size="sm">
        <ItemMedia variant="icon">
          <LockIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Lock Qrypt</ItemTitle>
          <ItemDescription>It also locks itself after 15 idle minutes.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="sm" variant="outline" onClick={() => void lock()}>
            Lock
          </Button>
        </ItemActions>
      </Item>
    </ItemGroup>
  )
}

void mount(
  <VaultGate>
    <Popup />
  </VaultGate>,
)

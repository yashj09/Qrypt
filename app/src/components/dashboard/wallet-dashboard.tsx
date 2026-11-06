import { useCallback, useEffect, useState, type ReactNode } from "react"
import {
  ActivityIcon,
  ArrowLeftRightIcon,
  AlertCircleIcon,
  CpuIcon,
  InfoIcon,
  LockIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import { LogoMark } from "@/components/brand/logo"
import { NetworkBadge } from "@/components/brand/network-badge"
import { Inspector } from "@/components/inspector/inspector"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Toggle } from "@/components/ui/toggle"
import { Activity } from "@/components/wallet/activity"
import { AddTokenDialog } from "@/components/wallet/add-token-dialog"
import { AssetList } from "@/components/wallet/asset-list"
import { BalanceHero } from "@/components/wallet/balance-hero"
import { ReceiveDialog } from "@/components/wallet/receive-dialog"
import { SendCard } from "@/components/wallet/send-card"
import { SwapPanel } from "@/components/swap/swap-panel"
import { TransferStatus } from "@/components/wallet/transfer-status"
import { useMediaQuery } from "@/hooks/use-media-query"
import type { Wallet } from "@/hooks/use-wallet"
import { assetKey } from "@/lib/assets"
import { short, units } from "@/lib/format"
import type { PaymentRequest } from "@/lib/payment-request"
import { BRAND } from "@/lib/site"

export interface ExtraSection {
  id: string
  label: string
  icon: LucideIcon
  render: () => ReactNode
}

interface Props {
  w: Wallet
  onLock: () => void
  /** This platform's settings cards: unlock methods, recovery, notifications, key actions. */
  settings: ReactNode
  /** Sections only one platform has, e.g. the extension's connected sites. Shown before Settings. */
  extraSections?: ExtraSection[]
  /** Opened from a pay link: start on Send, prefilled. */
  initialSend?: PaymentRequest
}

const BUILT_IN = [
  { id: "portfolio", label: "Portfolio", icon: WalletIcon },
  { id: "send", label: "Send", icon: SendIcon },
  { id: "swap", label: "Swap", icon: ArrowLeftRightIcon },
  { id: "activity", label: "Activity", icon: ActivityIcon },
  { id: "hood", label: "Under the hood", icon: CpuIcon },
] as const

const SETTINGS = { id: "settings", label: "Settings", icon: SettingsIcon } as const
const PIN_KEY = "qrypt.pinHood"

/** The open section lives in the URL hash, so reloads and links keep it. */
function useSection(ids: string[], initial: string): [string, (id: string) => void] {
  const known = ids.join(",")
  const fromHash = useCallback(() => {
    const id = window.location.hash.slice(1)
    return known.split(",").includes(id) ? id : initial
  }, [known, initial])
  const [section, setSection] = useState(fromHash)
  useEffect(() => {
    const onHash = () => setSection(fromHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [fromHash])
  return [section, (id) => (window.location.hash = id)]
}

/** The wallet dashboard shared by the website (desktop) and the extension's fullscreen tab. */
export function WalletDashboard({ w, onLock, settings, extraSections = [], initialSend }: Props) {
  const { deployment, account, wallet, assets, fee, names, busy, run, activity, tab, setTab, notice, error, actions } = w
  const nav = [...BUILT_IN, ...extraSections, SETTINGS]
  const [section, go] = useSection(
    nav.map((s) => s.id),
    initialSend ? "send" : "portfolio",
  )
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [addTokenOpen, setAddTokenOpen] = useState(false)
  const [pinned, setPinned] = useState(() => localStorage.getItem(PIN_KEY) === "1")
  const wide = useMediaQuery("(min-width: 1280px)")
  const usdc = deployment && assets[0] ? wallet?.holdings[assetKey(assets[0])] : undefined
  const pin = (on: boolean) => {
    localStorage.setItem(PIN_KEY, on ? "1" : "0")
    setPinned(on)
  }
  // Pinned, the inspector sits beside every other section on wide screens.
  const besideHood = pinned && wide && section !== "hood"

  const inspector = (
    <Inspector run={run} tab={tab} onTab={setTab} busy={busy} canRun={!!deployment && !!account} onStress={actions.stress} />
  )
  const pinToggle = (
    <Toggle variant="outline" size="sm" pressed={pinned} onPressedChange={pin} aria-label="Keep open beside wallet">
      {pinned ? <PinOffIcon data-icon="inline-start" /> : <PinIcon data-icon="inline-start" />}
      {pinned ? "Unpin" : "Keep open beside wallet"}
    </Toggle>
  )

  const body = (() => {
    if (!account) {
      return (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No account yet</EmptyTitle>
            <EmptyDescription>Finish setting up {BRAND} first.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    }
    switch (section) {
      case "portfolio":
        return (
          <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="flex flex-col gap-6">
              <BalanceHero account={account} usdc={usdc} onSend={() => go("send")} onReceive={() => setReceiveOpen(true)} onActivity={() => go("activity")} onSwap={deployment?.uniswap ? () => go("swap") : undefined} className="p-7" />
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Assets</h2>
                <Button variant="ghost" size="sm" onClick={() => setAddTokenOpen(true)}>
                  <PlusIcon data-icon="inline-start" />
                  Add token
                </Button>
              </div>
              <AssetList assets={assets} holdings={wallet?.holdings ?? null} />
            </div>
            <Activity local={activity} transfers={wallet?.transfers ?? null} names={names} />
          </div>
        )
      case "send":
        return (
          <div className="grid items-start gap-6 @3xl:grid-cols-2">
            <SendCard
              initial={initialSend}
              assets={assets}
              holdings={wallet?.holdings ?? null}
              fee={fee}
              sending={busy === "send"}
              disabled={!deployment || busy !== null}
              onSend={actions.send}
            />
            {run ? <TransferStatus run={run} onHood={besideHood ? undefined : () => go("hood")} /> : <SendHint onHood={besideHood ? undefined : () => go("hood")} />}
          </div>
        )
      case "swap":
        return (
          <div className="grid items-start gap-6 @3xl:grid-cols-2">
            <Card>
              <CardContent>
                <SwapPanel w={w} />
              </CardContent>
            </Card>
            {run?.swap ? <TransferStatus run={run} onHood={besideHood ? undefined : () => go("hood")} /> : <SwapHint />}
          </div>
        )
      case "activity":
        return <Activity local={activity} transfers={wallet?.transfers ?? null} names={names} />
      case "hood":
        return <div className="rounded-2xl border bg-lattice p-6">{inspector}</div>
      case "settings":
        return <div className="grid items-start gap-6 @3xl:grid-cols-2">{settings}</div>
      default:
        return extraSections.find((s) => s.id === section)?.render()
    }
  })()

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside className="sticky top-0 flex h-svh w-72 shrink-0 flex-col gap-6 border-r p-5">
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="text-lg font-semibold tracking-tight">{BRAND}</span>
          <Badge variant="success" className="ml-1">
            post-quantum
          </Badge>
        </div>
        {account && (
          <div className="flex flex-col gap-1 rounded-xl bg-muted p-3">
            <span className="text-xs text-muted-foreground">Account</span>
            <span className="font-mono text-sm">{short(account, 6)}</span>
            <span className="text-sm tabular-nums">{usdc !== undefined ? `${units(usdc, 6)} USDC` : "…"}</span>
          </div>
        )}
        <nav className="flex flex-col gap-1">
          {nav.map((s) => (
            <Button key={s.id} variant={section === s.id ? "secondary" : "ghost"} className="justify-start" onClick={() => go(s.id)}>
              <s.icon data-icon="inline-start" />
              {s.label}
            </Button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <NetworkBadge />
          <Button variant="outline" onClick={onLock}>
            <LockIcon data-icon="inline-start" />
            Lock
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 gap-6 p-8">
        <div className="@container flex min-w-0 flex-1 justify-center">
          <div className="flex w-full max-w-5xl flex-col gap-6">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-2xl font-semibold tracking-tight">{nav.find((s) => s.id === section)!.label}</h1>
              {section === "hood" && wide && pinToggle}
            </div>
            {notice && (
              <Alert>
                <InfoIcon />
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription className="break-all">{error}</AlertDescription>
              </Alert>
            )}
            {body}
          </div>
        </div>
        {besideHood && (
          <section aria-label="Under the hood" className="sticky top-8 flex max-h-[calc(100svh-4rem)] w-[min(44%,640px)] shrink-0 flex-col gap-3">
            <div className="flex justify-end">{pinToggle}</div>
            <div className="min-h-0 overflow-y-auto rounded-2xl border bg-lattice p-6">{inspector}</div>
          </section>
        )}
      </main>

      {account && deployment && (
        <>
          <ReceiveDialog open={receiveOpen} onOpenChange={setReceiveOpen} account={account} chainId={deployment.chainId} assets={assets} />
          <AddTokenDialog open={addTokenOpen} onOpenChange={setAddTokenOpen} onAdd={actions.addToken} />
        </>
      )}
    </div>
  )
}

function SwapHint() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Uniswap v4, signed with Falcon</CardTitle>
        <CardDescription>
          Approve, a one-block Permit2 allowance and the swap go into one atomic frame transaction. Gas comes out of your
          USDC; if the price moves past your minimum, everything is undone. Pools on this devnet are seeded by Qrypt.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function SendHint({ onHood }: { onHood?: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>One transaction, no ETH</CardTitle>
        <CardDescription>
          {BRAND} signs with Falcon-512 and repays the gas in USDC inside the same frame transaction.{" "}
          {onHood ? "Watch it go through the mempools under the hood." : "Watch it go through the mempools in the panel beside."}
        </CardDescription>
      </CardHeader>
      {onHood && (
        <CardContent>
          <Button variant="outline" size="sm" onClick={onHood}>
            <CpuIcon data-icon="inline-start" />
            Under the hood
          </Button>
        </CardContent>
      )}
    </Card>
  )
}

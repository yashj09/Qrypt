import { useEffect, useState, type ReactNode } from "react"
import {
  ArrowDownToLineIcon,
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpFromLineIcon,
  CpuIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  ScanLineIcon,
  SettingsIcon,
  SquarePlusIcon,
} from "lucide-react"
import { formatUnits, type Address } from "viem"
import { LogoMark } from "@/components/brand/logo"
import { Inspector } from "@/components/inspector/inspector"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Activity } from "@/components/wallet/activity"
import type { Wallet } from "@/hooks/use-wallet"
import { isIos, isStandalone } from "@/hooks/use-media-query"
import { useInstallPrompt } from "@/lib/pwa"
import { assetDecimals, assetKey, assetSymbol } from "@/lib/assets"
import { short, units } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PaymentRequest } from "@/lib/payment-request"
import { ReceiveScreen } from "./receive-screen"
import { ScanScreen } from "./scan-screen"
import { SendFlow } from "./send-flow"
import { InstallGuide } from "./install-guide"
import { SwapPanel } from "@/components/swap/swap-panel"
import { TransferStatus } from "@/components/wallet/transfer-status"

type Screen =
  | { kind: "home" }
  | { kind: "send"; request?: PaymentRequest }
  | { kind: "receive" }
  | { kind: "swap" }
  | { kind: "scan" }
  | { kind: "activity" }
  | { kind: "settings" }

const HIDE_KEY = "qrypt.hideBalances"

/** The home-screen shortcuts in the manifest open /app#receive and /app#scan. */
function fromHash(): Screen {
  const hash = window.location.hash.slice(1)
  if (hash === "receive" || hash === "scan" || hash === "activity") {
    history.replaceState(null, "", window.location.pathname)
    return { kind: hash }
  }
  return { kind: "home" }
}

/** Page padding that clears the notch and home indicator when installed (viewport-fit=cover). */
const PAGE =
  "bg-background px-[max(1rem,env(safe-area-inset-left))] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]"

interface Props {
  w: Wallet
  account: Address
  /** Opened from a pay link: start on the pay screen. */
  request?: PaymentRequest
  onLock: () => void
  /** The settings body (unlock methods, recovery, key actions); shared with the desktop layout. */
  settings: ReactNode
}

/** The phone wallet: one thumb-reachable home, and full-screen steps for send, receive and scan. */
export function MobileWallet({ w, account, request, onLock, settings }: Props) {
  const { assets, wallet, prices, activity, names, run, tab, setTab, busy, deployment, error, notice, actions } = w
  const [screen, setScreen] = useState<Screen>(() => (request ? { kind: "send", request } : fromHash()))
  const install = useInstallPrompt()
  useEffect(() => {
    // A shortcut tapped while the app is already open only changes the hash.
    const onHash = () => {
      const next = fromHash()
      if (next.kind !== "home") setScreen(next)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  const [hidden, setHidden] = useState(() => localStorage.getItem(HIDE_KEY) === "1")
  const [hoodOpen, setHoodOpen] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const toggleHidden = () => {
    localStorage.setItem(HIDE_KEY, hidden ? "0" : "1")
    setHidden(!hidden)
  }
  // The headline is the whole portfolio in dollars: USDC at $1, other assets at the Uniswap pools' mid prices.
  const total = wallet
    ? assets.reduce((sum, a, i) => {
        const price = i === 0 ? 1 : (prices[assetKey(a)] ?? 0)
        return sum + Number(formatUnits(wallet.holdings[assetKey(a)] ?? 0n, assetDecimals(a))) * price
      }, 0)
    : undefined
  const mask = (s: string) => (hidden ? "••••" : s)
  const home = () => setScreen({ kind: "home" })

  const titled = (title: string, body: ReactNode) => (
    <div className={cn("flex min-h-svh flex-col gap-4", PAGE)}>
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={home}>
          <ArrowLeftIcon />
        </Button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </header>
      {body}
    </div>
  )

  if (screen.kind === "send")
    return titled(
      screen.request ? "Pay" : "Send",
      <SendFlow w={w} request={screen.request} onScan={() => setScreen({ kind: "scan" })} onDone={home} />,
    )
  if (screen.kind === "receive") return titled("Receive", <ReceiveScreen account={account} assets={assets} />)
  if (screen.kind === "swap")
    return titled("Swap", <SwapPanel w={w} phone footer={run?.swap && <TransferStatus run={run} />} />)
  if (screen.kind === "scan") return titled("Scan to pay", <ScanScreen onResult={(req) => setScreen({ kind: "send", request: req })} />)
  if (screen.kind === "activity") return titled("Activity", <Activity local={activity} transfers={wallet?.transfers ?? null} names={names} />)
  if (screen.kind === "settings")
    return titled(
      "Settings",
      <div className="flex flex-col gap-4">
        {install && (
          <Button variant="outline" onClick={() => void install()}>
            <SquarePlusIcon data-icon="inline-start" />
            Install Qrypt
          </Button>
        )}
        {isIos() && !isStandalone() && (
          <Button variant="outline" onClick={() => setInstallOpen(true)}>
            <SquarePlusIcon data-icon="inline-start" />
            Add Qrypt to your Home Screen
          </Button>
        )}
        {settings}
        <Button variant="outline" onClick={onLock}>
          <LockIcon data-icon="inline-start" />
          Lock Qrypt
        </Button>
        <InstallGuide open={installOpen} onOpenChange={setInstallOpen} />
      </div>,
    )

  return (
    <div className={cn("flex min-h-svh flex-col gap-6", PAGE)}>
      <header className="flex items-center justify-between">
        <Button variant="outline" className="h-11 rounded-full px-3" onClick={() => setScreen({ kind: "receive" })}>
          <LogoMark className="size-5" />
          <span className="font-mono text-sm">{short(account, 4)}</span>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="icon-lg" className="rounded-full" aria-label={hidden ? "Show balances" : "Hide balances"} onClick={toggleHidden}>
            {hidden ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
          <Button variant="outline" size="icon-lg" className="rounded-full" aria-label="Settings" onClick={() => setScreen({ kind: "settings" })}>
            <SettingsIcon />
          </Button>
        </div>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="line-clamp-3 break-all">{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col items-center gap-2 py-6 text-center">
        {total !== undefined ? (
          <span className="text-6xl font-semibold tracking-tight tabular-nums">
            ${mask(total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          </span>
        ) : (
          <Skeleton className="h-16 w-48" />
        )}
        <span className="text-sm text-muted-foreground">Total balance · 0 ETH needed for gas</span>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {assets.slice(1).map((a) => (
            <Badge key={assetKey(a)} variant="outline" className="font-mono">
              {mask(units(wallet?.holdings[assetKey(a)] ?? 0n, assetDecimals(a)))} {assetSymbol(a)}
            </Badge>
          ))}
        </div>
      </section>

      <div className={cn("grid gap-3", deployment?.uniswap ? "grid-cols-4" : "grid-cols-3")}>
        <Tile icon={<ArrowDownToLineIcon />} label="Receive" onClick={() => setScreen({ kind: "receive" })} />
        <Tile icon={<ArrowUpFromLineIcon />} label="Send" onClick={() => setScreen({ kind: "send" })} />
        {deployment?.uniswap && <Tile icon={<ArrowLeftRightIcon />} label="Swap" onClick={() => setScreen({ kind: "swap" })} />}
        <Tile icon={<ScanLineIcon />} label="Scan" onClick={() => setScreen({ kind: "scan" })} />
      </div>

      <Button variant="ghost" className="self-center rounded-full" onClick={() => setHoodOpen(true)} disabled={!deployment}>
        <CpuIcon data-icon="inline-start" />
        Under the hood
      </Button>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Activity</h2>
        <Button variant="ghost" size="sm" onClick={() => setScreen({ kind: "activity" })}>
          View all
        </Button>
      </div>
      <Activity bare local={activity.slice(0, 3)} transfers={(wallet?.transfers ?? []).slice(0, 4)} names={names} />

      <Sheet open={hoodOpen} onOpenChange={setHoodOpen}>
        <SheetContent side="bottom" className="dark max-h-[85svh] overflow-y-auto bg-lattice p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="sr-only">
            <SheetTitle>Under the hood</SheetTitle>
            <SheetDescription>Mempool verdicts and frames for your last transaction.</SheetDescription>
          </SheetHeader>
          <Inspector run={run} tab={tab} onTab={setTab} busy={busy} canRun={!!deployment} onStress={actions.stress} />
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Tile({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <Button variant="outline" className="h-24 flex-col gap-2 rounded-2xl text-base [&_svg]:size-6 [&_svg]:text-success" onClick={onClick}>
      {icon}
      {label}
    </Button>
  )
}

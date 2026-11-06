import { useEffect, useState, type ReactNode } from "react"
import {
  ActivityIcon,
  AlertCircleIcon,
  CpuIcon,
  GlobeIcon,
  InfoIcon,
  LockIcon,
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { Activity } from "@/components/wallet/activity"
import { AddTokenDialog } from "@/components/wallet/add-token-dialog"
import { KeyCard } from "@/components/wallet/key-card"
import { ReceiveDialog } from "@/components/wallet/receive-dialog"
import { SendCard } from "@/components/wallet/send-card"
import { TransferStatus } from "@/components/wallet/transfer-status"
import { useWallet, type Wallet } from "@/hooks/use-wallet"
import { assetKey } from "@/lib/assets"
import { short, units } from "@/lib/format"
import { AssetList } from "./components/asset-list"
import { BalanceHero } from "./components/balance-hero"
import { VaultGate } from "./components/vault-gate"
import { TouchIdCard } from "./components/touch-id-card"
import { mount } from "./mount"
import { changePassword, lock } from "./vault"

const SECTIONS = [
  { id: "portfolio", label: "Portfolio", icon: WalletIcon },
  { id: "send", label: "Send", icon: SendIcon },
  { id: "activity", label: "Activity", icon: ActivityIcon },
  { id: "hood", label: "Under the hood", icon: CpuIcon },
  { id: "sites", label: "Connected sites", icon: GlobeIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

type SectionId = (typeof SECTIONS)[number]["id"]

const sectionFromHash = (): SectionId => {
  const id = window.location.hash.slice(1)
  return SECTIONS.some((s) => s.id === id) ? (id as SectionId) : "portfolio"
}

function useSection(): [SectionId, (id: SectionId) => void] {
  const [section, setSection] = useState(sectionFromHash)
  useEffect(() => {
    const onHash = () => setSection(sectionFromHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  return [section, (id) => (window.location.hash = id)]
}

function Dashboard() {
  const w = useWallet()
  const { deployment, account, wallet, assets, notice, error } = w
  const [section, go] = useSection()
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [addTokenOpen, setAddTokenOpen] = useState(false)
  const usdc = deployment && assets[0] ? wallet?.holdings[assetKey(assets[0])] : undefined

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside className="sticky top-0 flex h-svh w-72 shrink-0 flex-col gap-6 border-r p-5">
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="text-lg font-semibold tracking-tight">Eyrie</span>
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
          {SECTIONS.map((s) => (
            <Button
              key={s.id}
              variant={section === s.id ? "secondary" : "ghost"}
              className="justify-start"
              onClick={() => go(s.id)}
            >
              <s.icon data-icon="inline-start" />
              {s.label}
            </Button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <NetworkBadge />
          <Button variant="outline" onClick={() => void lock()}>
            <LockIcon data-icon="inline-start" />
            Lock
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 justify-center p-8">
        <div className="flex w-full max-w-5xl flex-col gap-6">
          <h1 className="text-2xl font-semibold tracking-tight">{SECTIONS.find((s) => s.id === section)!.label}</h1>
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
          {!account ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No account yet</EmptyTitle>
                <EmptyDescription>Finish setting up Eyrie in the onboarding tab.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Section id={section} w={w} usdc={usdc} go={go} onReceive={() => setReceiveOpen(true)} onAddToken={() => setAddTokenOpen(true)} />
          )}
        </div>
      </main>

      {account && deployment && (
        <>
          <ReceiveDialog open={receiveOpen} onOpenChange={setReceiveOpen} account={account} chainId={deployment.chainId} assets={assets} />
          <AddTokenDialog open={addTokenOpen} onOpenChange={setAddTokenOpen} onAdd={w.actions.addToken} />
        </>
      )}
    </div>
  )
}

interface SectionProps {
  id: SectionId
  w: Wallet
  usdc: bigint | undefined
  go: (id: SectionId) => void
  onReceive: () => void
  onAddToken: () => void
}

function Section({ id, w, usdc, go, onReceive, onAddToken }: SectionProps) {
  const { deployment, account, wallet, assets, fee, names, busy, run, activity, tab, setTab, actions } = w
  switch (id) {
    case "portfolio":
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col gap-6">
            <BalanceHero account={account!} usdc={usdc} onSend={() => go("send")} onReceive={onReceive} onActivity={() => go("activity")} className="p-7" />
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Assets</h2>
              <Button variant="ghost" size="sm" onClick={onAddToken}>
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
        <div className="grid gap-6 lg:grid-cols-2">
          <SendCard assets={assets} holdings={wallet?.holdings ?? null} fee={fee} sending={busy === "send"} disabled={!deployment || busy !== null} onSend={actions.send} />
          {run ? <TransferStatus run={run} /> : <SendHint />}
        </div>
      )
    case "activity":
      return <Activity local={activity} transfers={wallet?.transfers ?? null} names={names} />
    case "hood":
      return (
        <div className="rounded-2xl border bg-lattice p-6">
          <Inspector run={run} tab={tab} onTab={setTab} busy={busy} canRun={!!deployment && !!account} onStress={actions.stress} />
        </div>
      )
    case "sites":
      return <ConnectedSites />
    case "settings":
      return (
        <div className="grid gap-6 lg:grid-cols-2">
          <KeyCard busy={busy !== null} onBackup={actions.backup} onRotate={actions.rotate} onClose={actions.close} onForget={actions.forget} />
          <div className="flex flex-col gap-6">
            <ChangePasswordCard />
            <TouchIdCard />
          </div>
        </div>
      )
  }
}

function SendHint() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>One transaction, no ETH</CardTitle>
        <CardDescription>
          Eyrie signs with Falcon-512 and repays the gas in USDC inside the same frame transaction. Watch it go through the
          mempools under "Under the hood".
        </CardDescription>
      </CardHeader>
    </Card>
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
        <EmptyDescription>Dapps you connect to through Eyrie show up here.</EmptyDescription>
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

function ChangePasswordCard(): ReactNode {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [working, setWorking] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const ready = current.length > 0 && next.length >= 10 && !working
  const submit = async () => {
    setWorking(true)
    setResult(null)
    try {
      await changePassword(current, next)
      setCurrent("")
      setNext("")
      setResult({ ok: true, message: "Password changed." })
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message })
    } finally {
      setWorking(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Re-encrypts the key's wrapper; the Falcon key itself doesn't change.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field data-invalid={(result && !result.ok) || undefined}>
            <FieldLabel htmlFor="current-password">Current password</FieldLabel>
            <Input id="current-password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            {result && !result.ok && <FieldError>{result.message}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="next-password">New password (10+ characters)</FieldLabel>
            <Input id="next-password" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-between gap-3">
        <span className="text-sm text-muted-foreground">{result?.ok ? result.message : ""}</span>
        <Button disabled={!ready} onClick={submit}>
          {working && <Spinner data-icon="inline-start" />}
          Change password
        </Button>
      </CardFooter>
    </Card>
  )
}

void mount(
  <VaultGate>
    <Dashboard />
  </VaultGate>,
)

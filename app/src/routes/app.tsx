import { useCallback, useEffect, useMemo, useState } from "react"
import type { Address } from "viem"
import { AlertCircleIcon, PanelRightOpenIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Inspector, type InspectorTab } from "@/components/inspector/inspector"
import { Activity } from "@/components/wallet/activity"
import { AddTokenDialog } from "@/components/wallet/add-token-dialog"
import { KeyCard } from "@/components/wallet/key-card"
import { PortfolioCard } from "@/components/wallet/portfolio-card"
import { ReceiveDialog } from "@/components/wallet/receive-dialog"
import { OnboardCard } from "@/components/wallet/onboard-card"
import { SendCard } from "@/components/wallet/send-card"
import { TopBar } from "@/components/wallet/top-bar"
import { TransferStatus } from "@/components/wallet/transfer-status"
import { cn } from "@/lib/utils"
import { short } from "@/lib/format"
import {
  client,
  createAccount,
  estimateFee,
  forgetAccount,
  inclusion,
  loadDeployment,
  prepareCalls,
  usdcPayment,
  statusOf,
  storedAccount,
  toAlt,
  toCanonical,
  toStock,
  usdcBalance,
  type Deployment,
  type OnboardStage,
  type Scenario,
} from "@/lib/qpay"
import { addCustomToken, balanceOf, formatAsset, knownAssets, readWallet, transferCall, type WalletSnapshot } from "@/lib/assets"
import { loadActivity, saveActivity, toActivity, type ActivityEntry, type Intent, type Run } from "@/lib/run"

const STRESS_RECIPIENT: Address = "0x000000000000000000000000000000000000dEaD"
const STRESS_AMOUNT = 1_000_000n

export default function AppPage() {
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [account, setAccount] = useState<Address | null>(null)
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null)
  const [tokensVersion, setTokensVersion] = useState(0)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [addTokenOpen, setAddTokenOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<OnboardStage | null>(null)
  const [busy, setBusy] = useState<Scenario | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [tab, setTab] = useState<InspectorTab>("mempools")

  const fee = useMemo(
    () => (deployment && account ? estimateFee(deployment, account, [usdcPayment(deployment, account, 0n)]) : null),
    [deployment, account],
  )
  // tokensVersion bumps when the user adds a token, which changes what knownAssets reads from storage.
  const assets = useMemo(
    () => (deployment && account ? knownAssets(deployment, account) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deployment, account, tokensVersion],
  )
  const refresh = useCallback(
    async (d: Deployment, a: Address) => setWallet(await readWallet(d, a, knownAssets(d, a))),
    [],
  )

  const selectAccount = (a: Address | null) => {
    setAccount(a)
    setActivity(a ? loadActivity(a) : [])
  }

  useEffect(() => {
    loadDeployment()
      .then((d) => {
        setDeployment(d)
        const a = storedAccount(d)
        setAccount(a)
        setActivity(a ? loadActivity(a) : [])
      })
      .catch((e) => setError(String(e?.message ?? e)))
  }, [])

  useEffect(() => {
    if (!deployment || !account) return
    const tick = () => readWallet(deployment, account, assets).then(setWallet, () => {})
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [deployment, account, assets])

  const onCreate = async () => {
    if (!deployment) return
    setError(null)
    try {
      selectAccount(await createAccount(deployment, setStage))
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setStage(null)
    }
  }

  const onForget = () => {
    if (!deployment) return
    forgetAccount(deployment)
    selectAccount(null)
    setWallet(null)
    setRun(null)
  }

  const remember = (r: Run) => {
    if (!account) return
    setActivity((prev) => {
      const next = [toActivity(r), ...prev.filter((e) => e.hash !== r.hash)]
      saveActivity(account, next)
      return next
    })
  }

  const onRun = async (scenario: Scenario, intent: Intent) => {
    if (!deployment || !account) return
    setBusy(scenario)
    setError(null)
    setTab("mempools")
    let current: Run | null = null
    const update = (patch: Partial<Run>) => {
      current = { ...current!, ...patch }
      setRun(current)
    }
    const t = intent.transfer
    try {
      const before = {
        recipient: t ? await balanceOf(t.asset, t.recipient) : undefined,
        paymaster: await usdcBalance(deployment, deployment.paymaster),
        senderEth: await client.getBalance({ address: account }),
      }
      const p = await prepareCalls(deployment, account, intent.calls, scenario)
      current = {
        scenario,
        hash: p.hash,
        title: intent.title,
        transfer: t,
        frames: p.frames,
        fee: p.fee,
        signMs: p.signMs,
        at: Date.now(),
        verdicts: {},
      }
      setRun(current)
      const canonical = await toCanonical(p)
      update({ verdicts: { canonical } })
      const stock = await toStock(p)
      update({ verdicts: { canonical, stock } })
      const alt = await toAlt(p)
      const via = alt.accepted ? "alt" : stock.accepted ? "stock" : undefined
      update({ verdicts: { canonical, stock, alt }, via })
      remember(current!)
      if (via) {
        for (let i = 0; i < 60; i++) {
          const status = await statusOf(p.hash, via).catch(() => current!.status)
          update({ status })
          if (status === "OnChain" || status === "Reverted" || status === "Cancelled") break
          await new Promise((r) => setTimeout(r, 1500))
        }
        if (current!.status === "OnChain") {
          const ethSent = t?.asset.kind === "eth" ? t.amount : 0n
          update({
            delta: {
              recipient: t && before.recipient !== undefined ? (await balanceOf(t.asset, t.recipient)) - before.recipient : undefined,
              paymaster: (await usdcBalance(deployment, deployment.paymaster)) - before.paymaster,
              gasEth: (await client.getBalance({ address: account })) - before.senderEth + ethSent,
            },
            included: await inclusion(p.hash).catch(() => undefined),
          })
        }
        remember(current!)
      }
      await refresh(deployment, account)
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setBusy(null)
    }
  }

  const inspector = (
    <Inspector
      run={run}
      tab={tab}
      onTab={setTab}
      busy={busy}
      canRun={!!deployment && !!account}
      onStress={(s) =>
        deployment &&
        onRun(s, {
          title: s === "tamper" ? "Tampered signature" : "Underpaid fee",
          calls: [usdcPayment(deployment, STRESS_RECIPIENT, STRESS_AMOUNT)],
        })
      }
    />
  )

  return (
    <div className="flex min-h-svh flex-col">
      <TopBar
        account={account}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((o) => !o)}
        mobileInspector={
          <Sheet>
            <SheetTrigger render={<Button variant="outline" size="icon-sm" className="lg:hidden" aria-label="Under the hood" />}>
              <PanelRightOpenIcon />
            </SheetTrigger>
            <SheetContent side="bottom" className="dark max-h-[85svh] overflow-y-auto bg-lattice p-6">
              <SheetHeader className="sr-only">
                <SheetTitle>Under the hood</SheetTitle>
              </SheetHeader>
              {inspector}
            </SheetContent>
          </Sheet>
        }
      />
      <div className={cn("grid flex-1", inspectorOpen && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]")}>
        <main className="flex justify-center px-4 py-8 lg:px-8 lg:py-12">
          <div className="flex w-full max-w-md flex-col gap-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription className="break-all">{error}</AlertDescription>
              </Alert>
            )}
            {account ? (
              <>
                <PortfolioCard
                  assets={assets}
                  holdings={wallet?.holdings ?? null}
                  stake={wallet?.balances.stake ?? null}
                  onReceive={() => setReceiveOpen(true)}
                  onAddToken={() => setAddTokenOpen(true)}
                />
                <SendCard
                  assets={assets}
                  holdings={wallet?.holdings ?? null}
                  fee={fee}
                  sending={busy === "send"}
                  disabled={!deployment || busy !== null}
                  onSend={(asset, recipient, amount) =>
                    onRun("send", {
                      title: `${formatAsset(asset, amount)} to ${short(recipient, 4)}`,
                      calls: [transferCall(asset, recipient, amount)],
                      transfer: { asset, recipient, amount },
                    })
                  }
                />
                {run && <TransferStatus run={run} />}
                <Activity local={activity} transfers={wallet?.transfers ?? null} />
                <KeyCard onForget={onForget} />
                {deployment && (
                  <>
                    <ReceiveDialog
                      open={receiveOpen}
                      onOpenChange={setReceiveOpen}
                      account={account}
                      chainId={deployment.chainId}
                      assets={assets}
                    />
                    <AddTokenDialog
                      open={addTokenOpen}
                      onOpenChange={setAddTokenOpen}
                      onAdd={(asset) => {
                        addCustomToken(deployment, account, asset)
                        setTokensVersion((v) => v + 1)
                      }}
                    />
                  </>
                )}
              </>
            ) : (
              <OnboardCard stage={stage} disabled={!deployment} onCreate={onCreate} />
            )}
          </div>
        </main>
        {inspectorOpen && (
          <aside className="dark hidden border-l bg-lattice px-6 py-8 lg:block lg:px-10 lg:py-12">
            <div className="sticky top-20 max-w-2xl">{inspector}</div>
          </aside>
        )}
      </div>
    </div>
  )
}

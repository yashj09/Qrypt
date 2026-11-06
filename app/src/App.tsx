import { useCallback, useEffect, useState } from "react"
import type { Address } from "viem"
import { AlertCircleIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { AccountCard } from "@/components/account-card"
import { SendCard } from "@/components/send-card"
import { GatesPanel, type Run } from "@/components/gates-panel"
import { FramesCard } from "@/components/frames-card"
import { OnboardCard } from "@/components/onboard-card"
import {
  client,
  createAccount,
  forgetAccount,
  storedAccount,
  inclusion,
  loadDeployment,
  prepare,
  readBalances,
  statusOf,
  toAlt,
  toCanonical,
  toStock,
  usdcBalance,
  type Balances,
  type Deployment,
  type Scenario,
} from "@/lib/qpay"

export function App() {
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [balances, setBalances] = useState<Balances | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Scenario | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [account, setAccount] = useState<Address | null>(null)
  const [onboarding, setOnboarding] = useState(false)

  const refresh = useCallback(async (d: Deployment, a: Address) => setBalances(await readBalances(d, a)), [])

  useEffect(() => {
    loadDeployment()
      .then((d) => {
        setDeployment(d)
        setAccount(storedAccount(d))
      })
      .catch((e) => setError(String(e?.message ?? e)))
  }, [])

  useEffect(() => {
    if (!deployment || !account) return
    refresh(deployment, account).catch(() => {})
    const id = setInterval(() => refresh(deployment, account).catch(() => {}), 4000)
    return () => clearInterval(id)
  }, [deployment, account, refresh])

  const onCreate = async () => {
    if (!deployment) return
    setOnboarding(true)
    setError(null)
    try {
      setAccount(await createAccount(deployment))
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setOnboarding(false)
    }
  }

  const onForget = () => {
    if (!deployment) return
    forgetAccount(deployment)
    setAccount(null)
    setBalances(null)
    setRun(null)
  }

  const onRun = async (scenario: Scenario, recipient: Address, amount: bigint) => {
    if (!deployment || !account) return
    setBusy(scenario)
    setError(null)
    try {
      const before = {
        recipient: await usdcBalance(deployment, recipient),
        paymaster: await usdcBalance(deployment, deployment.paymaster),
        senderEth: await client.getBalance({ address: account }),
      }
      const p = await prepare(deployment, account, recipient, amount, scenario)
      let current: Run = { scenario, hash: p.hash, fee: p.fee, signMs: p.signMs }
      setRun(current)
      const canonical = await toCanonical(p)
      current = { ...current, canonical }
      setRun(current)
      const stock = await toStock(p)
      current = { ...current, stock }
      setRun(current)
      const alt = await toAlt(p)
      current = { ...current, alt }
      setRun(current)
      const via = alt.accepted ? "alt" : stock.accepted ? "stock" : null
      if (via) {
        for (let i = 0; i < 60; i++) {
          const status = await statusOf(p.hash, via).catch(() => current.status)
          current = { ...current, status }
          setRun(current)
          if (status === "OnChain" || status === "Reverted") break
          await new Promise((r) => setTimeout(r, 1500))
        }
        if (current.status === "OnChain") {
          current = {
            ...current,
            delta: {
              recipient: (await usdcBalance(deployment, recipient)) - before.recipient,
              paymaster: (await usdcBalance(deployment, deployment.paymaster)) - before.paymaster,
              senderEth: (await client.getBalance({ address: account })) - before.senderEth,
            },
            included: await inclusion(p.hash).catch(() => undefined),
          }
          setRun(current)
        }
      }
      await refresh(deployment, account)
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Q-Pay</h1>
          <p className="text-sm text-muted-foreground">
            Post-quantum USDC payments on EIP-8141 frame transactions. Zero ETH, zero middlemen.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">EIP-8141</Badge>
          <Badge variant="outline">ERC-8421</Badge>
          {deployment && <Badge variant="secondary">chain {deployment.chainId}</Badge>}
        </div>
      </header>
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription className="break-all">{error}</AlertDescription>
        </Alert>
      )}
      <main className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-6">
          {account ? (
            <>
              <AccountCard account={account} balances={balances} onForget={onForget} />
              <SendCard busy={busy} disabled={!deployment} onRun={onRun} />
            </>
          ) : (
            <OnboardCard busy={onboarding} disabled={!deployment} onCreate={onCreate} />
          )}
        </div>
        <div className="flex flex-col gap-6">
          <GatesPanel run={run} />
          <FramesCard />
        </div>
      </main>
    </div>
  )
}

export default App

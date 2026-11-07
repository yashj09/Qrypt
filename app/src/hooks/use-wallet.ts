import { useCallback, useEffect, useMemo, useState } from "react"
import type { Address } from "viem"
import type { InspectorTab } from "@/components/inspector/inspector"
import {
  client,
  createAccount,
  estimateFee,
  forgetAccount,
  inclusion,
  loadDeployment,
  prepareCalls,
  statusOf,
  storedAccount,
  toAlt,
  toCanonical,
  toStock,
  usdcBalance,
  usdcPayment,
  type Deployment,
  type OnboardStage,
  type Scenario,
} from "@/lib/qpay"
import { addCustomToken, assetDecimals, assetKey, assetSymbol, balanceOf, formatAsset, knownAssets, readWallet, transferCall, type Asset, type WalletSnapshot } from "@/lib/assets"
import { currencyOf, quote, routeLabel, swapCalls, usdPrices, type Quote } from "@/lib/swap"
import { minOut } from "@/lib/uniswap-v4"
import { WorldIdError, type ProveHuman } from "@/lib/world"
import { closeAccountCalls, createBackup, downloadBackup, prepareRotation, restoreBackup, settleRotation } from "@/lib/keys"
import { loadActivity, runPhase, saveActivity, toActivity, type ActivityEntry, type Intent, type Run } from "@/lib/run"
import { short } from "@/lib/format"

const STRESS_RECIPIENT: Address = "0x000000000000000000000000000000000000dEaD"
const STRESS_AMOUNT = 1_000_000n
const message = (e: unknown) => String((e as Error)?.message ?? e)

/**
 * Everything a wallet screen needs: the account, its balances and history, the transaction in flight, and the
 * actions. The website's /app, the extension popup and the extension dashboard all render from this one hook.
 */
export function useWallet() {
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [account, setAccount] = useState<Address | null>(null)
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null)
  const [tokensVersion, setTokensVersion] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<OnboardStage | null>(null)
  const [busy, setBusy] = useState<Scenario | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [tab, setTab] = useState<InspectorTab>("mempools")
  /** Dollars per whole unit, keyed by assetKey; from the Uniswap pools' mid prices. */
  const [prices, setPrices] = useState<Record<string, number>>({})

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
  const refresh = useCallback(async (d: Deployment, a: Address) => {
    const list = knownAssets(d, a)
    setWallet(await readWallet(d, a, list))
    if (d.uniswap) {
      const byCurrency = await usdPrices(client, d.uniswap, d.usdc, list.map((x) => ({ address: currencyOf(x), decimals: assetDecimals(x) }))).catch(() => ({}) as Record<string, number>)
      setPrices(Object.fromEntries(list.flatMap((x) => (byCurrency[currencyOf(x).toLowerCase()] !== undefined ? [[assetKey(x), byCurrency[currencyOf(x).toLowerCase()]]] : []))))
    }
  }, [])

  const selectAccount = (a: Address | null) => {
    setAccount(a)
    setActivity(a ? loadActivity(a) : [])
    if (!a) setWallet(null)
  }

  useEffect(() => {
    loadDeployment()
      .then((d) => {
        setDeployment(d)
        const a = storedAccount(d)
        setAccount(a)
        setActivity(a ? loadActivity(a) : [])
        if (a)
          settleRotation(d, a).then(
            (r) => r === "rotated" && setNotice("Your key rotation landed while you were away. Make a new backup."),
            () => {},
          )
      })
      .catch((e) => setError(message(e)))
  }, [])

  useEffect(() => {
    if (!deployment || !account) return
    const tick = () => readWallet(deployment, account, assets).then(setWallet, () => {})
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [deployment, account, assets])

  const remember = (r: Run) => {
    if (!account) return
    setActivity((prev) => {
      const next = [toActivity(r), ...prev.filter((e) => e.hash !== r.hash)]
      saveActivity(account, next)
      return next
    })
  }

  const runIntent = async (scenario: Scenario, intent: Intent): Promise<Run | null> => {
    if (!deployment || !account) return null
    setBusy(scenario)
    setError(null)
    setTab("mempools")
    let current: Run | null = null
    const update = (patch: Partial<Run>) => {
      current = { ...current!, ...patch }
      setRun(current)
    }
    const t = intent.transfer
    const sw = intent.swap
    try {
      const before = {
        recipient: t ? await balanceOf(t.asset, t.recipient) : undefined,
        swapTo: sw ? await balanceOf(sw.to, account) : undefined,
        paymaster: await usdcBalance(deployment, deployment.paymaster),
        senderEth: await client.getBalance({ address: account }),
      }
      const p = await prepareCalls(deployment, account, intent.calls, scenario, { atomic: intent.atomic })
      current = {
        scenario,
        hash: p.hash,
        title: intent.title,
        transfer: t,
        swap: sw,
        atomic: intent.atomic,
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
          const ethSent = intent.calls.reduce((sum, c) => sum + (c.value ?? 0n), 0n)
          const swapReceived = sw && before.swapTo !== undefined ? (await balanceOf(sw.to, account)) - before.swapTo : undefined
          // ETH bought by a swap isn't gas either.
          const ethReceived = sw?.to.kind === "eth" ? (swapReceived ?? 0n) : 0n
          update({
            delta: {
              recipient: t && before.recipient !== undefined ? (await balanceOf(t.asset, t.recipient)) - before.recipient : undefined,
              paymaster: (await usdcBalance(deployment, deployment.paymaster)) - before.paymaster,
              gasEth: (await client.getBalance({ address: account })) - before.senderEth + ethSent - ethReceived,
              swapReceived,
            },
            included: await inclusion(p.hash).catch(() => undefined),
          })
        }
        remember(current!)
      }
      await refresh(deployment, account)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(null)
    }
    return current
  }

  const actions = {
    /** Creates the account for the key store's seed; returns its address, or null if it failed (the error is shown). */
    /** Throws WorldIdError when World ID didn't approve, so the screen can offer the alternatives. */
    async create(proveHuman?: ProveHuman): Promise<Address | null> {
      if (!deployment) return null
      setError(null)
      try {
        const created = await createAccount(deployment, setStage, proveHuman)
        selectAccount(created)
        return created
      } catch (e) {
        if (e instanceof WorldIdError) throw e
        setError(message(e))
        return null
      } finally {
        setStage(null)
      }
    },
    async forget() {
      if (!deployment) return
      await forgetAccount(deployment)
      selectAccount(null)
      setRun(null)
    },
    /** Re-reads the stored account, e.g. after another extension page created or imported one. */
    reload() {
      if (deployment) selectAccount(storedAccount(deployment))
    },
    send: (asset: Asset, recipient: Address, amount: bigint) =>
      runIntent("send", {
        title: `${formatAsset(asset, amount)} to ${short(recipient, 4)}`,
        calls: [transferCall(asset, recipient, amount)],
        transfer: { asset, recipient, amount },
      }),
    /**
     * Swaps exactly `q.amountIn` of `from` for at least the reviewed quote minus `slippageBps`. Re-quotes first and
     * returns "price-moved" instead of signing if the market already moved past that minimum.
     */
    async swap(q: Quote, from: Asset, to: Asset, slippageBps: number): Promise<Run | null | "price-moved"> {
      if (!deployment?.uniswap || !account) return null
      const u = deployment.uniswap
      const min = minOut(q.amountOut, slippageBps)
      setError(null)
      try {
        const fresh = await quote(client, u, q.route, q.amountIn)
        if (fresh.amountOut < min) return "price-moved"
      } catch (e) {
        setError(message(e))
        return null
      }
      // Devnet inclusion can take minutes; the router rejects anything after the deadline.
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60)
      const symbols = { in: assetSymbol(from), out: assetSymbol(to) }
      const symbolOf = (c: Address) => (c.toLowerCase() === currencyOf(from).toLowerCase() ? symbols.in : c.toLowerCase() === currencyOf(to).toLowerCase() ? symbols.out : c.toLowerCase() === deployment.usdc.toLowerCase() ? "USDC" : "…")
      return runIntent("send", {
        title: `Swap ${formatAsset(from, q.amountIn)} for ${symbols.out}`,
        calls: swapCalls(u, q.route, q.amountIn, min, deadline, symbols),
        swap: { from, to, amountIn: q.amountIn, minOut: min, route: routeLabel(q.route, symbolOf) },
        atomic: true,
      })
    },
    stress: (s: Scenario) =>
      deployment &&
      runIntent(s, {
        title: s === "tamper" ? "Tampered signature" : "Underpaid fee",
        calls: [usdcPayment(deployment, STRESS_RECIPIENT, STRESS_AMOUNT)],
      }),
    async backup(password: string) {
      if (!deployment || !account) return
      downloadBackup(await createBackup(deployment, account, password))
      setNotice("Backup downloaded. Keep the file and the password in different places.")
    },
    async rotate() {
      if (!deployment || !account) return
      setNotice(null)
      const call = await prepareRotation(deployment, account)
      const r = await runIntent("send", { title: "Rotate Falcon key", calls: [call] })
      const result = r && runPhase(r) === "included" ? await settleRotation(deployment, account) : "unchanged"
      setNotice(
        result === "rotated"
          ? "Key rotated. The old key no longer works, and neither do old backups: make a new one now."
          : "The rotation didn't land, so your current key is unchanged.",
      )
    },
    async close(to: Address) {
      if (!deployment || !account || !wallet) return
      const r = await runIntent("send", { title: "Close account", calls: closeAccountCalls(deployment, account, to, assets, wallet.holdings) })
      if (r && runPhase(r) === "included") setNotice(`Account closed. Stake and balances went to ${short(to, 4)}.`)
    },
    async restore(file: File, password: string) {
      if (!deployment) return
      selectAccount(await restoreBackup(deployment, file, password))
      setNotice("Key restored and checked onchain. This wallet now controls the account.")
    },
    addToken(asset: Asset) {
      if (!deployment || !account) return
      addCustomToken(deployment, account, asset)
      setTokensVersion((v) => v + 1)
    },
  }

  const names = useMemo<Record<string, string>>(
    () =>
      deployment
        ? {
            [deployment.stakingRegistry.toLowerCase()]: "the staking registry",
            [deployment.factory.toLowerCase()]: "the Qrypt factory",
            [deployment.paymaster.toLowerCase()]: "the paymaster",
            "0x0000000000000000000000000000000000000000": "a mint",
          }
        : ({} as Record<string, string>),
    [deployment],
  )

  return { deployment, account, wallet, assets, prices, fee, names, notice, setNotice, error, setError, stage, busy, run, activity, tab, setTab, actions }
}

export type Wallet = ReturnType<typeof useWallet>

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AlertTriangleIcon, ArrowDownUpIcon, ArrowLeftRightIcon, LayersIcon, RefreshCwIcon, SettingsIcon } from "lucide-react"
import type { Address } from "viem"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Wallet } from "@/hooks/use-wallet"
import { assetDecimals, assetKey, assetSymbol, type Asset } from "@/lib/assets"
import { toBaseUnits, units, usd, usdcAmount } from "@/lib/format"
import { client, estimateFee } from "@/lib/qpay"
import { currencyOf, findRoute, quote as fetchQuote, routeLabel, swapCalls, type Quote } from "@/lib/swap"
import { minOut } from "@/lib/uniswap-v4"
import { cn } from "@/lib/utils"

const SLIPPAGE_KEY = "qrypt.slippageBps"
const SLIPPAGE_PRESETS = [10, 50, 100]
const REFRESH_S = 15
/** Above this, the impact is shown in amber; above the next, the swap needs an explicit confirmation. */
const IMPACT_WARN = 0.01
const IMPACT_CONFIRM = 0.05

type QuoteState =
  | { kind: "idle" }
  | { kind: "loading"; previous?: Quote }
  | { kind: "ok"; quote: Quote }
  | { kind: "error"; message: string }

interface Props {
  w: Wallet
  /** Phone: the review opens as a bottom sheet. */
  phone?: boolean
  /** Shown under the panel once a swap is running (e.g. the transfer status). */
  footer?: ReactNode
  className?: string
}

/**
 * Swap any two assets the wallet holds through Qrypt's Uniswap v4 pools. One Falcon-signed transaction: approve to
 * Permit2, a one-block Permit2 allowance, and UniversalRouter.execute, as an atomic batch with gas paid in USDC.
 */
export function SwapPanel({ w, phone, footer, className }: Props) {
  const { deployment, account, assets, wallet, prices, busy, actions } = w
  const u = deployment?.uniswap
  const holdings = wallet?.holdings ?? null
  const swappable = useMemo(() => (u ? assets.filter((a) => assets.some((b) => b !== a && findRoute(u, currencyOf(a), currencyOf(b)))) : []), [assets, u])

  // Chosen ids; until the user picks, the first two swappable assets (they arrive after the first render).
  const [pickedFrom, setPickedFrom] = useState<string | null>(null)
  const [pickedTo, setPickedTo] = useState<string | null>(null)
  const fromId = pickedFrom ?? (swappable[0] ? assetKey(swappable[0]) : "")
  const toId = pickedTo ?? (swappable[1] ? assetKey(swappable[1]) : "")
  const [amount, setAmountRaw] = useState("")
  const [slippageBps, setSlippageBps] = useState(() => Number(localStorage.getItem(SLIPPAGE_KEY) ?? 50))
  const [state, setState] = useState<QuoteState>({ kind: "idle" })
  const [invertRate, setInvertRate] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [impactOk, setImpactOk] = useState(false)
  const [priceMoved, setPriceMoved] = useState(false)
  // Seconds since the pair or amount last changed; a new quote is fetched at the start of every REFRESH_S round.
  const [seconds, setSeconds] = useState(0)
  const round = Math.floor(seconds / REFRESH_S)
  const countdown = REFRESH_S - (seconds % REFRESH_S)

  const from = swappable.find((a) => assetKey(a) === fromId)
  const to = swappable.find((a) => assetKey(a) === toId)
  const route = useMemo(() => (u && from && to ? findRoute(u, currencyOf(from), currencyOf(to)) : null), [u, from, to])
  const amountIn = from ? toBaseUnits(amount, assetDecimals(from)) : 0n
  const sending = busy !== null
  const q = state.kind === "ok" ? state.quote : state.kind === "loading" ? state.previous : undefined
  const min = q ? minOut(q.amountOut, slippageBps) : 0n
  const setAmount = (v: string) => {
    setAmountRaw(v)
    setSeconds(0)
  }

  // Quote (debounced) whenever the pair, the amount or the refresh round changes.
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      if (!u || !route || amountIn <= 0n) {
        setState({ kind: "idle" })
        return
      }
      setState((s) => ({ kind: "loading", previous: s.kind === "ok" ? s.quote : s.kind === "loading" ? s.previous : undefined }))
      fetchQuote(client, u, route, amountIn)
        .then((quote) => !cancelled && setState({ kind: "ok", quote }))
        .catch((e: Error) => !cancelled && setState({ kind: "error", message: e.message }))
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [u, route, amountIn, round])
  // The clock only runs while there's something to quote and nothing is being reviewed or signed.
  const ticking = !reviewing && !sending && amountIn > 0n
  useEffect(() => {
    if (!ticking) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [ticking])
  /** Jump to the next round, i.e. re-quote now. */
  const requote = () => setSeconds((s) => (Math.floor(s / REFRESH_S) + 1) * REFRESH_S)

  // The fee depends on the frames' gas limits, so it is known before the quote comes back.
  const fee = useMemo(() => {
    if (!deployment || !account || !u || !route || !from || !to) return null
    const calls = swapCalls(u, route, amountIn > 0n ? amountIn : 1n, 1n, 0n, { in: assetSymbol(from), out: assetSymbol(to) })
    return estimateFee(deployment, account, calls, { atomic: true })
  }, [deployment, account, u, route, from, to, amountIn])

  if (!u || swappable.length < 2 || !from || !to) {
    return (
      <Alert className={className}>
        <ArrowLeftRightIcon />
        <AlertTitle>Swaps aren't available</AlertTitle>
        <AlertDescription>This network has no Uniswap pools for your assets yet.</AlertDescription>
      </Alert>
    )
  }

  const usdcKey = deployment ? deployment.usdc.toLowerCase() : ""
  const fromBalance = holdings?.[assetKey(from)] ?? null
  const usdcBalance = holdings?.[usdcKey] ?? null
  const fromIsUsdc = assetKey(from) === usdcKey
  const short = fromBalance !== null && amountIn > fromBalance - (fromIsUsdc ? (fee ?? 0n) : 0n)
  const feeShort = !fromIsUsdc && usdcBalance !== null && fee !== null && fee > usdcBalance
  const impact = q?.priceImpact ?? 0
  const symbolOf = (c: Address) => {
    const a = assets.find((x) => currencyOf(x).toLowerCase() === c.toLowerCase())
    return a ? assetSymbol(a) : "?"
  }
  const fromSym = assetSymbol(from)
  const toSym = assetSymbol(to)
  const dollars = (a: Asset, v: bigint) => (prices[assetKey(a)] !== undefined ? usd((Number(v) / 10 ** assetDecimals(a)) * prices[assetKey(a)]) : null)

  const flip = () => {
    setPickedFrom(toId)
    setPickedTo(fromId)
    setAmount(q ? units(q.amountOut, assetDecimals(to)).replace(/,/g, "") : "")
  }
  const pick = (side: "from" | "to", id: string) => {
    // Picking the asset on the other side swaps them, like every swap UI.
    if (side === "from") {
      if (id === toId) setPickedTo(fromId)
      setPickedFrom(id)
    } else {
      if (id === fromId) setPickedFrom(toId)
      setPickedTo(id)
    }
    setSeconds(0)
  }
  const max = () => {
    if (fromBalance === null) return
    const spendable = fromIsUsdc ? (fee !== null && fromBalance > fee ? fromBalance - fee : 0n) : fromBalance
    setAmount(units(spendable, assetDecimals(from)).replace(/,/g, ""))
  }
  const setSlippage = (bps: number) => {
    setSlippageBps(bps)
    localStorage.setItem(SLIPPAGE_KEY, String(bps))
  }

  const cta: { label: string; ready: boolean } =
    amountIn <= 0n
      ? { label: "Enter an amount", ready: false }
      : short
        ? { label: fromIsUsdc ? "Not enough USDC (amount + fee)" : `Insufficient ${fromSym}`, ready: false }
        : feeShort
          ? { label: "Not enough USDC for the fee", ready: false }
          : state.kind === "error"
            ? { label: "No quote for this amount", ready: false }
            : !q || state.kind === "loading"
              ? { label: "Getting a quote", ready: false }
              : { label: "Review swap", ready: !sending }

  const openReview = () => {
    setImpactOk(false)
    setPriceMoved(false)
    setReviewing(true)
  }
  const confirm = async () => {
    if (!q) return
    const result = await actions.swap(q, from, to, slippageBps)
    if (result === "price-moved") {
      setPriceMoved(true)
      requote()
      return
    }
    setReviewing(false)
    setAmount("")
  }

  const rate = q && q.amountIn > 0n && q.amountOut > 0n
    ? (() => {
        const outPerIn = Number(q.amountOut) / 10 ** assetDecimals(to) / (Number(q.amountIn) / 10 ** assetDecimals(from))
        return invertRate ? `1 ${toSym} = ${fmt(1 / outPerIn)} ${fromSym}` : `1 ${fromSym} = ${fmt(outPerIn)} ${toSym}`
      })()
    : null

  const review = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">You pay</span>
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {q ? units(q.amountIn, assetDecimals(from)) : "…"} <span className="text-lg text-muted-foreground">{fromSym}</span>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">You receive about</span>
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {q ? units(q.amountOut, assetDecimals(to)) : "…"} <span className="text-lg text-muted-foreground">{toSym}</span>
        </span>
      </div>
      <Separator />
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Minimum received</dt>
        <dd className="text-right tabular-nums">{units(min, assetDecimals(to))} {toSym}</dd>
        <dt className="text-muted-foreground">Price impact</dt>
        <dd className={cn("text-right tabular-nums", impact >= IMPACT_CONFIRM ? "text-destructive" : impact >= IMPACT_WARN && "font-medium text-foreground")}>{pct(impact)}</dd>
        <dt className="text-muted-foreground">Slippage tolerance</dt>
        <dd className="text-right tabular-nums">{pct(slippageBps / 10_000)}</dd>
        <dt className="text-muted-foreground">Network fee, paid in USDC</dt>
        <dd className="text-right tabular-nums">{fee !== null ? usdcAmount(fee) : "…"} USDC</dd>
        <dt className="text-muted-foreground">ETH spent on gas</dt>
        <dd className="text-right tabular-nums">0</dd>
        <dt className="text-muted-foreground">Route</dt>
        <dd className="text-right">{q ? routeLabel(q.route, symbolOf) : "…"}</dd>
      </dl>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <LayersIcon className="mt-0.5 size-4 shrink-0" />
        Approve, a one-block Permit2 allowance and the Uniswap v4 swap run as one atomic batch, signed with Falcon-512. If the
        price moves past your minimum, all of it is undone and only the fee is paid.
      </p>
      {impact >= IMPACT_CONFIRM && (
        <Field orientation="horizontal">
          <Checkbox id="impact-ok" checked={impactOk} onCheckedChange={(v) => setImpactOk(v === true)} />
          <FieldLabel htmlFor="impact-ok">I understand this trade moves the price by {pct(impact)} and I may get much less.</FieldLabel>
        </Field>
      )}
      {priceMoved && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>The price moved</AlertTitle>
          <AlertDescription>The new quote is below your minimum, so nothing was signed. Check the new numbers and swap again.</AlertDescription>
        </Alert>
      )}
    </div>
  )
  const confirmButton = (
    <Button onClick={() => void confirm()} disabled={sending || !q || (impact >= IMPACT_CONFIRM && !impactOk)}>
      {sending ? <Spinner data-icon="inline-start" /> : <ArrowLeftRightIcon data-icon="inline-start" />}
      {sending ? "Swapping" : `Swap ${fromSym} for ${toSym}`}
    </Button>
  )

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline">
          <ArrowLeftRightIcon data-icon="inline-start" />
          Uniswap v4
        </Badge>
        <Popover>
          <PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="Slippage settings" />}>
            <SettingsIcon data-icon="inline-start" />
            Slippage {pct(slippageBps / 10_000)}
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-72 flex-col gap-3">
            <PopoverHeader>
              <PopoverTitle>Slippage tolerance</PopoverTitle>
              <PopoverDescription>The most the price may move against you before the swap reverts instead.</PopoverDescription>
            </PopoverHeader>
            <ToggleGroup variant="outline" value={[String(slippageBps)]} onValueChange={(v) => v[0] && setSlippage(Number(v[0]))}>
              {SLIPPAGE_PRESETS.map((bps) => (
                <ToggleGroupItem key={bps} value={String(bps)} aria-label={`${pct(bps / 10_000)} slippage`}>
                  {pct(bps / 10_000)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Field>
              <FieldLabel htmlFor="slippage-custom">Custom</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="slippage-custom"
                  inputMode="decimal"
                  placeholder="0.50"
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (v > 0 && v <= 50) setSlippage(Math.round(v * 100))
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>%</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>Between 0.01% and 50%.</FieldDescription>
            </Field>
          </PopoverContent>
        </Popover>
      </div>

      <div className="relative flex flex-col gap-1">
        <TokenBox
          label="You pay"
          hint={
            fromBalance !== null && (
              <Button variant="ghost" size="xs" onClick={max} className="tabular-nums">
                Balance {units(fromBalance, assetDecimals(from))} · Max
              </Button>
            )
          }
          token={<TokenSelect assets={swappable} value={fromId} onChange={(id) => pick("from", id)} label="Pay with" />}
          amount={
            <InputGroupInput
              id="swap-amount"
              aria-label={`Amount of ${fromSym} to swap`}
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-12 text-right text-3xl font-semibold tabular-nums md:text-3xl"
            />
          }
          value={amountIn > 0n ? dollars(from, amountIn) : null}
        />
        <Button
          variant="outline"
          size="icon"
          className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background"
          aria-label="Flip the assets"
          onClick={flip}
        >
          <ArrowDownUpIcon />
        </Button>
        <TokenBox
          label="You receive"
          token={<TokenSelect assets={swappable} value={toId} onChange={(id) => pick("to", id)} label="Receive" />}
          amount={
            <div className="flex h-12 min-w-0 flex-1 items-center justify-end px-2.5">
              {state.kind === "loading" && !state.previous ? (
                <Skeleton className="h-9 w-32" />
              ) : (
                <span data-testid="swap-out" className={cn("truncate text-3xl font-semibold tabular-nums", state.kind === "loading" && "opacity-60")}>
                  {q ? units(q.amountOut, assetDecimals(to)) : "0"}
                </span>
              )}
            </div>
          }
          value={q ? dollars(to, q.amountOut) : null}
        />
      </div>

      <div className="flex min-h-8 items-center justify-between gap-2 text-sm text-muted-foreground">
        {rate ? (
          <Button variant="ghost" size="sm" className="-ml-2 tabular-nums" onClick={() => setInvertRate((v) => !v)}>
            {rate}
          </Button>
        ) : (
          <span>{state.kind === "error" ? state.message : route ? "" : "No route between these assets."}</span>
        )}
        {q && (
          <span className="flex items-center gap-2 tabular-nums">
            {impact >= IMPACT_WARN && <Badge variant={impact >= IMPACT_CONFIRM ? "destructive" : "outline"}>Impact {pct(impact)}</Badge>}
            <RefreshCwIcon className={cn("size-3.5", state.kind === "loading" && "animate-spin")} aria-hidden />
            {countdown}s
          </span>
        )}
      </div>
      {fee !== null && amountIn > 0n && (
        <p className="text-sm text-muted-foreground">
          Network fee about {usdcAmount(fee)} USDC. ETH needed for gas: none.
        </p>
      )}

      <Button size="lg" className="w-full" disabled={!cta.ready} onClick={openReview}>
        {state.kind === "loading" && amountIn > 0n && !short ? <Spinner data-icon="inline-start" /> : <ArrowLeftRightIcon data-icon="inline-start" />}
        {cta.label}
      </Button>
      {footer}

      {phone ? (
        <Sheet open={reviewing} onOpenChange={setReviewing}>
          <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <SheetHeader className="p-0">
              <SheetTitle>Review swap</SheetTitle>
              <SheetDescription>Uniswap v4, one Falcon-signed transaction.</SheetDescription>
            </SheetHeader>
            {review}
            <SheetFooter className="p-0">{confirmButton}</SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={reviewing} onOpenChange={setReviewing}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review swap</DialogTitle>
              <DialogDescription>Uniswap v4, one Falcon-signed transaction.</DialogDescription>
            </DialogHeader>
            {review}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              {confirmButton}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function TokenBox({ label, hint, token, amount, value }: { label: string; hint?: ReactNode; token: ReactNode; amount: ReactNode; value: string | null }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted p-4">
      <div className="flex min-h-6 items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        {hint}
      </div>
      <InputGroup className="border-0 bg-transparent shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent">
        <InputGroupAddon align="inline-start">{token}</InputGroupAddon>
        {amount}
      </InputGroup>
      <span className="min-h-5 text-right text-sm text-muted-foreground tabular-nums">{value ?? ""}</span>
    </div>
  )
}

function TokenSelect({ assets, value, onChange, label }: { assets: Asset[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <Select items={assets.map((a) => ({ label: assetSymbol(a), value: assetKey(a) }))} value={value} onValueChange={(v) => onChange(String(v))}>
      <SelectTrigger aria-label={label} className="h-10 rounded-full bg-background pr-3 pl-1.5">
        <span className="flex size-7 items-center justify-center rounded-full bg-muted font-mono text-xs">
          {assetSymbol(assets.find((a) => assetKey(a) === value) ?? assets[0]).slice(0, 2)}
        </span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {assets.map((a) => (
            <SelectItem key={assetKey(a)} value={assetKey(a)}>
              {assetSymbol(a)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

const pct = (f: number) => `${(f * 100).toLocaleString(undefined, { maximumFractionDigits: f < 0.001 ? 3 : 2 })}%`
const fmt = (v: number) => (v >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v.toLocaleString(undefined, { maximumSignificantDigits: 6 }))

import { useMemo, useState } from "react"
import { ClipboardPasteIcon, FingerprintIcon, ScanLineIcon } from "lucide-react"
import { isAddress, parseUnits, type Address } from "viem"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TransferStatus } from "@/components/wallet/transfer-status"
import type { Wallet } from "@/hooks/use-wallet"
import { assetDecimals, assetKey, assetSymbol, resolveAsset, type Asset } from "@/lib/assets"
import { short, units, usdcAmount } from "@/lib/format"
import type { PaymentRequest } from "@/lib/payment-request"
import { AmountKeypad } from "./amount-keypad"

type Step = "amount" | "recipient" | "review" | "status"

const toBase = (amount: string, decimals: number) => {
  try {
    return amount ? parseUnits(amount, decimals) : 0n
  } catch {
    return 0n
  }
}

/** Amount first (keypad), then who, then a review that says what it costs: the fee in USDC and no ETH. */
export function SendFlow({ w, request, onScan, onDone }: { w: Wallet; request?: PaymentRequest; onScan: () => void; onDone: () => void }) {
  const { assets, wallet, fee, busy, run, actions } = w
  const [asset, setAsset] = useState<Asset>(() => resolveAsset(assets, request?.asset))
  const [amount, setAmount] = useState(request?.amount ?? "")
  const [to, setTo] = useState<string>(request?.to ?? "")
  const [step, setStep] = useState<Step>(request?.to && request.amount ? "review" : request?.to ? "amount" : "amount")
  const decimals = assetDecimals(asset)
  const value = toBase(amount, decimals)
  const holdings = wallet?.holdings
  const usdcKey = assetKey(assets[0])
  const payingInUsdc = assetKey(asset) === usdcKey
  const balance = holdings?.[assetKey(asset)] ?? 0n
  const usdcBalance = holdings?.[usdcKey] ?? 0n
  const affordable = (payingInUsdc ? value + (fee ?? 0n) : value) <= balance && (fee ?? 0n) <= usdcBalance
  const recents = useMemo(
    () => [...new Set((wallet?.transfers ?? []).filter((t) => t.direction === "out").map((t) => t.counterparty))].slice(0, 3),
    [wallet?.transfers],
  )

  if (step === "status") {
    return (
      <div className="flex flex-col gap-4">
        {run ? <TransferStatus run={run} /> : <Spinner className="mx-auto" />}
        <Button size="lg" disabled={busy !== null} onClick={onDone}>
          Done
        </Button>
      </div>
    )
  }

  if (step === "review") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-1 pt-4">
          <span className="text-5xl font-semibold tracking-tight tabular-nums">{units(value, decimals)}</span>
          <span className="text-muted-foreground">{assetSymbol(asset)}</span>
          <span className="mt-2 font-mono text-sm">to {short(to, 6)}</span>
        </div>
        <Separator />
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Network fee, paid in USDC</dt>
          <dd className="tabular-nums">{fee !== null ? usdcAmount(fee) : "…"} USDC</dd>
          <dt className="text-muted-foreground">ETH spent on gas</dt>
          <dd>0</dd>
          <dt className="text-muted-foreground">Signed with</dt>
          <dd>
            <Badge variant="secondary">Falcon-512</Badge>
          </dd>
        </dl>
        {!affordable && <FieldError>Not enough {payingInUsdc ? "USDC for the amount and the fee" : `${assetSymbol(asset)}, or USDC for the fee`}.</FieldError>}
        <Button
          size="lg"
          disabled={!affordable || busy !== null || value === 0n}
          onClick={() => {
            setStep("status")
            void actions.send(asset, to as Address, value)
          }}
        >
          <FingerprintIcon data-icon="inline-start" />
          Pay {units(value, decimals)} {assetSymbol(asset)}
        </Button>
        <Button variant="ghost" onClick={() => setStep("recipient")}>
          Change recipient
        </Button>
      </div>
    )
  }

  if (step === "recipient") {
    const valid = isAddress(to)
    return (
      <div className="flex flex-col gap-5">
        <Field data-invalid={(to.length > 0 && !valid) || undefined}>
          <FieldLabel htmlFor="send-to">To</FieldLabel>
          <InputGroup>
            <InputGroupInput id="send-to" className="font-mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} />
            <InputGroupAddon align="inline-end">
              <InputGroupButton aria-label="Paste" onClick={() => navigator.clipboard.readText().then((t) => setTo(t.trim()), () => {})}>
                <ClipboardPasteIcon />
              </InputGroupButton>
              <InputGroupButton aria-label="Scan" onClick={onScan}>
                <ScanLineIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {to.length > 0 && !valid && <FieldError>That isn't an address.</FieldError>}
        </Field>
        {recents.length > 0 && (
          <ItemGroup className="gap-2">
            <span className="text-xs text-muted-foreground">Recent</span>
            {recents.map((r) => (
              <Item key={r} variant="muted" size="xs" render={<button type="button" onClick={() => setTo(r)} />}>
                <ItemContent>
                  <ItemTitle className="font-mono">{short(r, 6)}</ItemTitle>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )}
        <Button size="lg" disabled={!valid} onClick={() => setStep("review")}>
          Review
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ToggleGroup value={[assetKey(asset)]} onValueChange={(v) => v[0] && setAsset(assets.find((a) => assetKey(a) === v[0]) ?? assets[0])} variant="outline" className="self-center">
        {assets.map((a) => (
          <ToggleGroupItem key={assetKey(a)} value={assetKey(a)}>
            {assetSymbol(a)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-col items-center gap-1">
        <span data-testid="send-amount" className="text-6xl font-semibold tracking-tight tabular-nums">
          {amount || "0"}
        </span>
        <span className="text-sm text-muted-foreground">
          {assetSymbol(asset)} · {holdings ? `${units(balance, decimals)} available` : "…"}
        </span>
      </div>
      <AmountKeypad value={amount} decimals={Math.min(decimals, 6)} onChange={setAmount} />
      <Button size="lg" disabled={value === 0n} onClick={() => setStep(isAddress(to) ? "review" : "recipient")}>
        Next
      </Button>
    </div>
  )
}

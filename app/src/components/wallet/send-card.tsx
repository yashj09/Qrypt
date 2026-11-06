import { useState } from "react"
import { ArrowRightIcon, SendIcon } from "lucide-react"
import type { Address } from "viem"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { assetDecimals, assetKey, assetSymbol, type Asset, type Holdings } from "@/lib/assets"
import { short, units, usdcAmount } from "@/lib/format"

const DEFAULT_RECIPIENT = "0x000000000000000000000000000000000000dEaD"

interface Props {
  assets: Asset[]
  holdings: Holdings | null
  fee: bigint | null
  sending: boolean
  disabled: boolean
  onSend: (asset: Asset, recipient: Address, amount: bigint) => void
}

/** Parses a decimal string into base units without going through floating point. */
function toBaseUnits(s: string, decimals: number): bigint {
  const m = s.trim().match(/^(\d*)(?:\.(\d*))?$/)
  if (!m || (!m[1] && !m[2])) return 0n
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0")
  return BigInt(m[1] || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0")
}

export function SendCard({ assets, holdings, fee, sending, disabled, onSend }: Props) {
  const [assetId, setAssetId] = useState(assetKey(assets[0]))
  const [recipient, setRecipient] = useState(DEFAULT_RECIPIENT)
  const [amount, setAmount] = useState("5")
  const [reviewing, setReviewing] = useState(false)
  const asset = assets.find((a) => assetKey(a) === assetId) ?? assets[0]
  const usdcId = assetKey(assets[0])
  const payingInUsdc = assetKey(asset) === usdcId
  const balance = holdings?.[assetKey(asset)] ?? null
  const usdcBalance = holdings?.[usdcId] ?? null
  const value = toBaseUnits(amount, assetDecimals(asset))
  const validRecipient = /^0x[0-9a-fA-F]{40}$/.test(recipient)
  const feeCovered = usdcBalance === null || fee === null || (payingInUsdc ? value + fee : fee) <= usdcBalance
  const amountCovered = payingInUsdc || balance === null || value <= balance
  const affordable = feeCovered && amountCovered
  const ready = validRecipient && value > 0n && affordable && !disabled && !sending
  const symbol = assetSymbol(asset)

  const max = () => {
    if (balance === null) return
    const spendable = payingInUsdc ? (fee !== null && balance > fee ? balance - fee : 0n) : balance
    setAmount(units(spendable, assetDecimals(asset)).replace(/,/g, ""))
  }

  const confirm = () => {
    setReviewing(false)
    onSend(asset, recipient as Address, value)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Send</CardTitle>
        <CardDescription>Any asset you hold. Signed with Falcon in this browser; the fee comes out of your USDC.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Asset</FieldLabel>
            <Select
              items={assets.map((a) => ({ label: assetSymbol(a), value: assetKey(a) }))}
              value={assetId}
              onValueChange={(v) => setAssetId(String(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {assets.map((a) => (
                    <SelectItem key={assetKey(a)} value={assetKey(a)}>
                      {assetSymbol(a)}
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {holdings ? units(holdings[assetKey(a)] ?? 0n, assetDecimals(a)) : ""}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={!validRecipient || undefined}>
            <FieldLabel htmlFor="recipient">Recipient</FieldLabel>
            <Input
              id="recipient"
              className="font-mono"
              value={recipient}
              aria-invalid={!validRecipient || undefined}
              onChange={(e) => setRecipient(e.target.value.trim())}
            />
            {!validRecipient && <FieldError>Enter a 0x address with 40 hex characters.</FieldError>}
          </Field>
          <Field data-invalid={!affordable || undefined}>
            <FieldLabel htmlFor="amount">Amount</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="amount"
                inputMode="decimal"
                className="tabular-nums"
                value={amount}
                aria-invalid={!affordable || undefined}
                onChange={(e) => setAmount(e.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{symbol}</InputGroupText>
                <InputGroupButton onClick={max}>Max</InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {affordable ? (
              <FieldDescription>Network fee about {fee !== null ? usdcAmount(fee) : "…"} USDC. ETH needed for gas: none.</FieldDescription>
            ) : (
              <FieldError>
                {!amountCovered ? `You hold less ${symbol} than that.` : "Not enough USDC to cover the amount and the fee."}
              </FieldError>
            )}
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <Button size="lg" className="w-full" disabled={!ready} onClick={() => setReviewing(true)}>
          {sending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
          {sending ? "Sending" : `Review ${symbol} payment`}
        </Button>
      </CardFooter>
      <Dialog open={reviewing} onOpenChange={setReviewing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review payment</DialogTitle>
            <DialogDescription>One frame transaction. If any check fails, nothing moves and nobody pays.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">{units(value, assetDecimals(asset))}</span>
              <span className="text-muted-foreground">{symbol}</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
              <span>You</span>
              <ArrowRightIcon className="size-4" />
              <span className="text-foreground">{short(recipient, 6)}</span>
            </div>
            <Separator />
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Network fee, paid in USDC</dt>
              <dd className="tabular-nums">{fee !== null ? usdcAmount(fee) : "…"} USDC</dd>
              <dt className="text-muted-foreground">ETH spent on gas</dt>
              <dd className="tabular-nums">0</dd>
              <dt className="text-muted-foreground">Signature</dt>
              <dd>Falcon-512</dd>
            </dl>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={confirm}>
              <SendIcon data-icon="inline-start" />
              Sign and send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

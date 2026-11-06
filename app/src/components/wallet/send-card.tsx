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
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { short, usdcAmount } from "@/lib/format"

const DEFAULT_RECIPIENT = "0x000000000000000000000000000000000000dEaD"

interface Props {
  balance: bigint | null
  fee: bigint | null
  sending: boolean
  disabled: boolean
  onSend: (recipient: Address, amount: bigint) => void
}

const toUnits = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 1e6)) : 0n
}

export function SendCard({ balance, fee, sending, disabled, onSend }: Props) {
  const [recipient, setRecipient] = useState(DEFAULT_RECIPIENT)
  const [amount, setAmount] = useState("5")
  const [reviewing, setReviewing] = useState(false)
  const validRecipient = /^0x[0-9a-fA-F]{40}$/.test(recipient)
  const units = toUnits(amount)
  const affordable = balance === null || fee === null || units + fee <= balance
  const ready = validRecipient && units > 0n && affordable && !disabled && !sending

  const max = () => balance !== null && fee !== null && balance > fee && setAmount(usdcAmount(balance - fee).replace(/,/g, ""))

  const confirm = () => {
    setReviewing(false)
    onSend(recipient as Address, units)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Send USDC</CardTitle>
        <CardDescription>Signed with Falcon in this browser. The fee comes out of your USDC.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
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
                <InputGroupText>USDC</InputGroupText>
                <InputGroupButton onClick={max}>Max</InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {affordable ? (
              <FieldDescription>Network fee about {fee !== null ? usdcAmount(fee) : "…"} USDC. ETH needed: none.</FieldDescription>
            ) : (
              <FieldError>Amount plus the fee is more than your balance.</FieldError>
            )}
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <Button size="lg" className="w-full" disabled={!ready} onClick={() => setReviewing(true)}>
          {sending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
          {sending ? "Sending" : "Review payment"}
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
              <span className="text-4xl font-semibold tracking-tight tabular-nums">{usdcAmount(units)}</span>
              <span className="text-muted-foreground">USDC</span>
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
              <dt className="text-muted-foreground">ETH spent</dt>
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

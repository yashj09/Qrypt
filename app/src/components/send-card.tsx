import { useState } from "react"
import { SendIcon, ShieldAlertIcon, CoinsIcon } from "lucide-react"
import type { Address } from "viem"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import type { Scenario } from "@/lib/qpay"

interface Props {
  busy: Scenario | null
  disabled: boolean
  onRun: (scenario: Scenario, recipient: Address, amount: bigint) => void
}

const DEFAULT_RECIPIENT = "0x000000000000000000000000000000000000dEaD"

export function SendCard({ busy, disabled, onRun }: Props) {
  const [recipient, setRecipient] = useState(DEFAULT_RECIPIENT)
  const [amount, setAmount] = useState("5")
  const validRecipient = /^0x[0-9a-fA-F]{40}$/.test(recipient)
  const units = BigInt(Math.round(Number(amount || "0") * 1e6))
  const ready = validRecipient && units > 0n && !disabled && busy === null

  const run = (scenario: Scenario) => onRun(scenario, recipient as Address, units)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send USDC</CardTitle>
        <CardDescription>
          You hold no ETH. The paymaster pays the gas and takes it back in USDC inside the same transaction.
        </CardDescription>
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
          </Field>
          <Field>
            <FieldLabel htmlFor="amount">Amount (USDC)</FieldLabel>
            <Input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <FieldDescription>The Falcon signature is created in this browser tab.</FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3">
        <Button size="lg" disabled={!ready} onClick={() => run("send")}>
          {busy === "send" ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
          Sign with Falcon and send
        </Button>
        <Separator />
        <span className="text-xs text-muted-foreground">Try to break it</span>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={!ready} onClick={() => run("tamper")}>
            {busy === "tamper" ? <Spinner data-icon="inline-start" /> : <ShieldAlertIcon data-icon="inline-start" />}
            Tamper signature
          </Button>
          <Button variant="outline" disabled={!ready} onClick={() => run("underpay")}>
            {busy === "underpay" ? <Spinner data-icon="inline-start" /> : <CoinsIcon data-icon="inline-start" />}
            Underpay gas fee
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}

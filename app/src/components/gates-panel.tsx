import { CheckCircle2Icon, XCircleIcon } from "lucide-react"
import type { Verdict } from "@qpay/frametx"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import type { Scenario } from "@/lib/qpay"
import { gas, short, usdc } from "@/lib/format"

export interface Run {
  scenario: Scenario
  hash: string
  fee: bigint
  signMs: number
  canonical?: Verdict
  stock?: Verdict
  alt?: Verdict
  status?: string
  delta?: { recipient: bigint; paymaster: bigint; senderEth: bigint }
  included?: { block: bigint; frameGas: bigint[] }
}

const FRAME_NAMES = ["Falcon VERIFY", "Paymaster VERIFY", "Repay in USDC", "Payment"]
const CANONICAL_CAP = 100_000n

const STEPS = ["New", "Pending", "Submitted", "OnChain"] as const

export function GatesPanel({ run }: { run: Run | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mempool gates</CardTitle>
        <CardDescription>The same signed transaction goes to both mempools. Responses are live.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!run ? (
          <p className="text-sm text-muted-foreground">Send a transaction to see how each mempool treats it.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{short(run.hash, 8)}</span>
              <Badge variant="outline">fee {usdc(run.fee)}</Badge>
              <Badge variant="outline">Falcon sign {run.signMs.toFixed(0)} ms</Badge>
              {run.scenario !== "send" && <Badge variant="destructive">{run.scenario === "tamper" ? "tampered signature" : "underpaid fee"}</Badge>}
            </div>
            <Gate title="Canonical mempool (EIP-8141, 100k cap)" verdict={run.canonical} />
            <Gate title="Stock alt mempool (flat 100k cap)" verdict={run.stock} />
            <Gate title="Q-Pay alt mempool (ERC-8421 BUDGET-010)" verdict={run.alt} />
            {run.alt?.accepted && (
              <>
                <Separator />
                <div className="flex flex-wrap items-center gap-2">
                  {STEPS.map((step) => {
                    const reached = run.status ? STEPS.indexOf(run.status as (typeof STEPS)[number]) >= STEPS.indexOf(step) : step === "New"
                    return (
                      <Badge key={step} variant={reached ? "default" : "outline"}>
                        {step}
                      </Badge>
                    )
                  })}
                  {run.status === "Reverted" && <Badge variant="destructive">Reverted</Badge>}
                </div>
              </>
            )}
            {run.delta && (
              <Alert>
                <CheckCircle2Icon />
                <AlertTitle>Included onchain{run.included ? ` in block ${run.included.block}` : ""}</AlertTitle>
                <AlertDescription className="flex flex-col gap-2">
                  <span>
                    Recipient +{usdc(run.delta.recipient)}. Paymaster +{usdc(run.delta.paymaster)} for gas. Your ETH changed by{" "}
                    {run.delta.senderEth.toString()} wei.
                  </span>
                  {run.included && (
                    <span className="flex flex-wrap gap-2">
                      {run.included.frameGas.map((g, i) => (
                        <Badge key={i} variant={i === 0 ? "default" : "outline"}>
                          {FRAME_NAMES[i] ?? `Frame ${i}`}: {gas(g)}
                          {i === 0 && g > CANONICAL_CAP ? ` (${(Number(g) / Number(CANONICAL_CAP)).toFixed(1)}x the canonical cap)` : ""}
                        </Badge>
                      ))}
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Gate({ title, verdict }: { title: string; verdict?: Verdict }) {
  if (!verdict) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Spinner />
        {title}
      </div>
    )
  }
  return (
    <Alert variant={verdict.accepted ? "default" : "destructive"}>
      {verdict.accepted ? <CheckCircle2Icon /> : <XCircleIcon />}
      <AlertTitle>
        {title}: {verdict.accepted ? "admitted" : "rejected"}
      </AlertTitle>
      <AlertDescription className="font-mono text-xs break-all">
        {verdict.accepted ? short(verdict.hash, 10) : verdict.reason}
      </AlertDescription>
    </Alert>
  )
}


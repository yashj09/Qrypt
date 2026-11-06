import { CheckCircle2Icon, XCircleIcon } from "lucide-react"
import type { Verdict } from "@qpay/frametx"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import type { Scenario } from "@/lib/qpay"
import { short, usdc } from "@/lib/format"

export interface Run {
  scenario: Scenario
  hash: string
  fee: bigint
  signMs: number
  canonical?: Verdict
  alt?: Verdict
  status?: string
  delta?: { recipient: bigint; paymaster: bigint; senderEth: bigint }
}

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
            <Gate title="Canonical mempool (EIP-8141)" verdict={run.canonical} />
            <Gate title="Alt mempool (ERC-8421, BUDGET-010)" verdict={run.alt} />
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
                <AlertTitle>Included onchain</AlertTitle>
                <AlertDescription>
                  Recipient +{usdc(run.delta.recipient)}. Paymaster +{usdc(run.delta.paymaster)} for gas. Your ETH changed by{" "}
                  {run.delta.senderEth.toString()} wei.
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


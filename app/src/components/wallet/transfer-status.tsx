import { CheckIcon, ExternalLinkIcon, XIcon } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { endpoints } from "@/lib/qpay"
import { PHASE_BADGE, runPhase, type Run, type RunPhase } from "@/lib/run"
import { formatAsset } from "@/lib/assets"
import { explorerTx } from "@/lib/site"
import { short, usdcAmount } from "@/lib/format"

type StepState = "done" | "active" | "failed" | "todo"

function steps(
  run: Run,
  phase: RunPhase
): { title: string; state: StepState }[] {
  const admitted = phase === "pending" || phase === "included"
  return [
    {
      title: `Signed with Falcon in ${run.signMs.toFixed(0)} ms`,
      state: "done",
    },
    {
      title:
        phase === "rejected"
          ? "Rejected by every mempool, nothing charged"
          : "Admitted by the alt mempool",
      state:
        phase === "rejected"
          ? "failed"
          : admitted || phase === "reverted" || phase === "dropped"
            ? "done"
            : "active",
    },
    {
      title: run.included
        ? `Included in block ${run.included.block}`
        : phase === "reverted"
          ? "Reverted onchain"
          : phase === "rejected"
            ? "Never reached a block"
            : phase === "dropped"
              ? "Dropped without being included. Nothing was charged; send it again"
              : "Included in a block",
      state:
        phase === "included"
          ? "done"
          : phase === "reverted" || phase === "dropped"
            ? "failed"
            : phase === "pending"
              ? "active"
              : "todo",
    },
  ]
}

export function TransferStatus({ run }: { run: Run }) {
  const phase = runPhase(run)
  const node =
    (run.via === "stock" && endpoints.stockAltMempool) || endpoints.altMempool
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <CardTitle>{run.title}</CardTitle>
          <CardDescription className="font-mono">
            {short(run.hash, 8)}
          </CardDescription>
          <CardAction>
            <Badge variant={PHASE_BADGE[phase].variant}>
              {PHASE_BADGE[phase].label}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ItemGroup>
            {steps(run, phase).map((s) => (
              <Item key={s.title} size="xs">
                <ItemMedia>
                  <span
                    data-state={s.state}
                    className="flex size-6 items-center justify-center rounded-full border text-muted-foreground data-[state=done]:border-success data-[state=done]:bg-success data-[state=done]:text-success-foreground data-[state=failed]:border-destructive data-[state=failed]:bg-destructive data-[state=failed]:text-primary-foreground"
                  >
                    {s.state === "done" ? (
                      <CheckIcon className="size-3.5" />
                    ) : s.state === "failed" ? (
                      <XIcon className="size-3.5" />
                    ) : s.state === "active" ? (
                      <Spinner className="size-3.5" />
                    ) : null}
                  </span>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle
                    className={
                      s.state === "todo" ? "text-muted-foreground" : undefined
                    }
                  >
                    {s.title}
                  </ItemTitle>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </CardContent>
        {phase === "included" && run.delta && (
          <CardFooter className="flex-col items-stretch gap-3">
            <dl className="grid grid-cols-3 gap-3 text-sm">
              {run.transfer && run.delta.recipient !== undefined ? (
                <Receipt
                  label="Sent"
                  value={formatAsset(run.transfer.asset, run.delta.recipient)}
                />
              ) : (
                <Receipt label="Calls" value={String(run.frames.length - 3)} />
              )}
              <Receipt
                label="Fee"
                value={`${usdcAmount(run.delta.paymaster)} USDC`}
              />
              <Receipt
                label="ETH on gas"
                value={`${(-run.delta.gasEth).toString()} wei`}
              />
            </dl>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a
                  href={explorerTx(run.hash, node)}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              View on the explorer
              <ExternalLinkIcon data-icon="inline-end" />
            </Button>
          </CardFooter>
        )}
      </Card>
    </motion.div>
  )
}

function Receipt({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

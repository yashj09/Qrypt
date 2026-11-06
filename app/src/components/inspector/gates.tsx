import { CheckIcon, CircleDashedIcon, XIcon } from "lucide-react"
import { motion } from "motion/react"
import type { Verdict } from "@qpay/frametx"
import { Badge } from "@/components/ui/badge"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { MEMPOOLS, SCENARIO_LABEL, runPhase, type Run } from "@/lib/run"
import { short, usdc } from "@/lib/format"

const LIFECYCLE = ["New", "Pending", "Submitted", "OnChain"] as const

export function Gates({ run }: { run: Run | null }) {
  return (
    <div className="flex flex-col gap-4">
      {run ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={run.scenario === "send" ? "secondary" : "destructive"}>{SCENARIO_LABEL[run.scenario]}</Badge>
          <Badge variant="outline" className="font-mono">
            {short(run.hash, 6)}
          </Badge>
          <Badge variant="outline">fee {usdc(run.fee)}</Badge>
          <Badge variant="outline">Falcon sign {run.signMs.toFixed(0)} ms</Badge>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          The same signed transaction goes to all three mempools at once. Send a payment or run a stress test to see their live
          answers.
        </p>
      )}
      <ItemGroup>
        {MEMPOOLS.map((m, i) => (
          <GateRow key={m.key} name={m.name} rule={m.rule} asked={!!run} verdict={run?.verdicts[m.key]} index={i} />
        ))}
      </ItemGroup>
      {run && runPhase(run) !== "rejected" && run.verdicts.alt !== undefined && <Lifecycle status={run.status} />}
      {run?.delta && run.included && (
        <>
          <Separator />
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Stat label="Included in block" value={run.included.block.toString()} />
            <Stat label="Your ETH changed by" value={`${run.delta.senderEth.toString()} wei`} />
            <Stat label="Recipient received" value={usdc(run.delta.recipient)} />
            <Stat label="Paymaster repaid" value={usdc(run.delta.paymaster)} />
          </dl>
        </>
      )}
    </div>
  )
}

function GateRow({ name, rule, asked, verdict, index }: { name: string; rule: string; asked: boolean; verdict?: Verdict; index: number }) {
  return (
    <Item variant="outline">
      <ItemMedia variant="icon">
        {!asked ? <CircleDashedIcon /> : !verdict ? <Spinner /> : verdict.accepted ? <CheckIcon /> : <XIcon />}
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
        <ItemDescription>{rule}</ItemDescription>
        {verdict && (
          <motion.p
            key={verdict.accepted ? verdict.hash : verdict.reason}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.05 }}
            className="font-mono text-xs break-all text-muted-foreground"
          >
            {verdict.accepted ? `admitted as ${short(verdict.hash, 8)}` : verdict.reason}
          </motion.p>
        )}
      </ItemContent>
      <ItemActions>
        {verdict ? (
          <Badge variant={verdict.accepted ? "success" : "destructive"}>{verdict.accepted ? "Admitted" : "Rejected"}</Badge>
        ) : (
          <Badge variant="outline">{asked ? "Asking" : "Idle"}</Badge>
        )}
      </ItemActions>
    </Item>
  )
}

function Lifecycle({ status }: { status?: string }) {
  const reached = status ? LIFECYCLE.indexOf(status as (typeof LIFECYCLE)[number]) : 0
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Status</span>
      {LIFECYCLE.map((step, i) => (
        <Badge key={step} variant={i <= reached ? "success" : "outline"} className="font-mono">
          {step}
        </Badge>
      ))}
      {status === "Reverted" && <Badge variant="destructive">Reverted</Badge>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  )
}

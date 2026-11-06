import { motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { CANONICAL_VERIFY_CAP, FRAMES, STAKED_VERIFY_BUDGET, proof } from "@/lib/site"
import type { Run } from "@/lib/run"

const pct = (n: bigint) => Math.min(100, (Number(n) / Number(STAKED_VERIFY_BUDGET)) * 100)

export function Frames({ run }: { run: Run | null }) {
  const measured = run?.included
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{measured ? `Measured onchain in block ${measured.block}` : `Measured onchain in block ${proof.block}`}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground" /> within 100k cap
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" /> needs an alt mempool
          </span>
        </span>
      </div>
      <ItemGroup>
        {FRAMES.map((f, i) => {
          const gasUsed = measured?.frameGas[i] ?? f.expectedGas
          return (
            <Item key={f.name} variant="outline">
              <ItemContent className="gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{i}</span>
                  <Badge variant={f.mode === "VERIFY" ? "default" : "secondary"} className="font-mono">
                    {f.mode}
                  </Badge>
                  <ItemTitle>{f.name}</ItemTitle>
                  <span className="text-xs text-muted-foreground">{f.runsAs}</span>
                </div>
                <ItemDescription className={f.mode === "SENDER" ? "font-mono text-xs" : undefined}>{f.does}</ItemDescription>
                <GasBar gasUsed={gasUsed} />
                {f.canonicalIssue && <span className="text-xs text-destructive">Canonical mempool: {f.canonicalIssue}</span>}
              </ItemContent>
            </Item>
          )
        })}
      </ItemGroup>
    </div>
  )
}

function GasBar({ gasUsed }: { gasUsed: bigint }) {
  const cap = pct(CANONICAL_VERIFY_CAP)
  const total = pct(gasUsed)
  const within = Math.min(total, cap)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2 rounded-full bg-muted">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-l-full bg-muted-foreground"
          initial={{ width: 0 }}
          animate={{ width: `${within}%` }}
          transition={{ duration: 0.5 }}
        />
        {total > cap && (
          <motion.div
            className="absolute inset-y-0 rounded-r-full bg-success"
            style={{ left: `${cap}%` }}
            initial={{ width: 0 }}
            animate={{ width: `${total - cap}%` }}
            transition={{ duration: 0.6, delay: 0.4 }}
          />
        )}
        <div className="absolute -inset-y-1 w-px bg-destructive" style={{ left: `${cap}%` }} />
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>{Number(gasUsed).toLocaleString()} gas</span>
        <span>staked budget 1M</span>
      </div>
    </div>
  )
}

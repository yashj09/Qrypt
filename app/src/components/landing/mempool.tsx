import { ExternalLinkIcon, GaugeIcon, LockIcon, UnlockIcon, type LucideIcon } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SectionHeading } from "@/components/landing/section"
import { CANONICAL_VERIFY_CAP, STAKED_VERIFY_BUDGET, links, proof } from "@/lib/site"

const BARS = [
  { label: "Canonical mempool VERIFY cap", gas: Number(CANONICAL_VERIFY_CAP), tone: "bg-destructive" },
  { label: "Falcon-512 signature check", gas: proof.falconGas, tone: "bg-success" },
  { label: "BUDGET-010 limit for staked accounts", gas: Number(STAKED_VERIFY_BUDGET), tone: "bg-muted-foreground" },
]

const RULES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: GaugeIcon,
    title: "Bounded",
    body: "Unstaked entities keep the 100k limit. Staked ones get at most 1M. Anything larger is rejected from its declared limits, before simulation.",
  },
  {
    icon: LockIcon,
    title: "Staked",
    body: "The larger budget costs locked, refundable stake per identity, and ERC-8421 reputation throttles any identity that wastes validation work.",
  },
  {
    icon: UnlockIcon,
    title: "No allowlist",
    body: "The rule is about stake and gas, not addresses. Any node running it admits any staked account. Nobody whitelists our contract.",
  },
]

export function Mempool() {
  const max = Number(STAKED_VERIFY_BUDGET)
  return (
    <section id="mempool" className="dark scroll-mt-16 bg-background bg-lattice py-20 text-foreground lg:py-28">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6">
        <SectionHeading
          eyebrow="Why it needs an alt mempool"
          title={<>Too heavy for the canonical mempool. <em>Safe for an alt one.</em></>}
        >
          A post-quantum signature check costs about seven times what the canonical mempool allows a VERIFY frame. We wrote
          an ERC-8421 rule that admits it without opening the door to denial of service.
        </SectionHeading>
        <div className="flex flex-col gap-6 rounded-2xl border bg-card p-6 lg:p-8">
          {BARS.map((b, i) => (
            <div key={b.label} className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span>{b.label}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{b.gas.toLocaleString()} gas</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted">
                <motion.div
                  className={cn("h-full rounded-full", b.tone)}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(b.gas / max) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: i * 0.12 }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {RULES.map((r) => (
            <div key={r.title} className="flex flex-col gap-3">
              <r.icon className="size-5 text-success" />
              <h3 className="text-lg font-semibold tracking-tight">{r.title}</h3>
              <p className="text-sm text-muted-foreground">{r.body}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" nativeButton={false} render={<a href={links.safetyDoc} target="_blank" rel="noreferrer" />}>
            Why this is safe for nodes and builders
            <ExternalLinkIcon data-icon="inline-end" />
          </Button>
          <Button variant="ghost" nativeButton={false} render={<a href={links.sidecarPr} target="_blank" rel="noreferrer" />}>
            The sidecar rule, upstream PR #2
            <ExternalLinkIcon data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </section>
  )
}

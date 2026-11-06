import { Badge } from "@/components/ui/badge"
import { Section, SectionHeading } from "@/components/landing/section"
import { CANONICAL_VERIFY_CAP, FRAMES, proof } from "@/lib/site"

const STEPS = [
  { title: "A key is born in your browser", body: "Falcon-512 keys are generated locally. Only the public key ever leaves the device." },
  { title: "An account is deployed for it", body: "A factory deploys an account that accepts nothing but that key, and stakes it for the alt mempool." },
  { title: "You pay with one transaction", body: "Four frames: check the signature, approve the paymaster, repay gas in USDC, send the payment." },
]

export function How() {
  return (
    <Section id="how" className="border-t">
      <SectionHeading eyebrow="How it works" title={<>Three steps, <em>one transaction.</em></>} />
      <ol className="grid gap-8 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-3">
            <span className="flex size-8 items-center justify-center rounded-full border font-mono text-sm">{i + 1}</span>
            <h3 className="text-lg font-semibold tracking-tight">{s.title}</h3>
            <p className="text-sm text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="dark rounded-2xl border bg-background bg-lattice p-6 text-foreground lg:p-8">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold tracking-tight">Inside the frame transaction</h3>
          <span className="font-mono text-xs text-muted-foreground">gas measured onchain, block {proof.block}</span>
        </div>
        <ol className="grid gap-3 lg:grid-cols-4">
          {FRAMES.map((f, i) => (
            <li key={f.name} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <Badge variant={f.mode === "VERIFY" ? "default" : "secondary"} className="font-mono">
                  {f.mode}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">frame {i}</span>
              </div>
              <span className="font-medium">{f.name}</span>
              <span className="text-xs text-muted-foreground">{f.runsAs}</span>
              <span
                data-heavy={f.expectedGas > CANONICAL_VERIFY_CAP || undefined}
                className="mt-auto font-mono text-sm tabular-nums data-heavy:text-success"
              >
                {Number(f.expectedGas).toLocaleString()} gas
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted-foreground">
          If any check fails, the whole transaction is invalid before anyone is charged: a bad signature stops at frame 0, an
          underpaid fee at frame 1.
        </p>
      </div>
    </Section>
  )
}

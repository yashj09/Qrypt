import { ArrowRightIcon, AtomIcon, CheckIcon, ExternalLinkIcon, XIcon } from "lucide-react"
import { motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { useBlockNumber } from "@/hooks/use-block-number"
import { proof } from "@/lib/site"

const GATES = [
  { name: "Canonical mempool", rule: "100k VERIFY cap", admitted: false },
  { name: "Hosted alt mempool", rule: "organisers' node", admitted: true },
  { name: "Eyrie alt mempool", rule: "BUDGET-010", admitted: true },
]

export function Hero() {
  return (
    <section className="border-b">
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-20 lg:grid-cols-[1.1fr_1fr] lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-start gap-8"
        >
          <Badge variant="outline">Live on the EIP-8141 devnet · ETHGlobal Mumbai 2026</Badge>
          <h1 className="text-5xl leading-[1.02] font-semibold tracking-tight text-balance lg:text-7xl">
            Pay in dollars. <span className="font-serif font-normal italic">Signed for the post-quantum era.</span>
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            Eyrie is a post-quantum wallet. Every transaction is signed with Falcon-512 and pays its gas in USDC, so you
            never need ETH. Use it as a browser extension with a fullscreen dashboard, or right here on the web.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" nativeButton={false} render={<a href="/app" />}>
              Create an account in 15 seconds
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<a href={proof.explorer} target="_blank" rel="noreferrer" />}>
              See a real transaction
              <ExternalLinkIcon data-icon="inline-end" />
            </Button>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative flex flex-col"
        >
          <Card className="w-full max-w-sm shadow-xl">
            <CardHeader>
              <CardDescription>Balance</CardDescription>
              <CardAction>
                <Badge variant="secondary">
                  <AtomIcon data-icon="inline-start" />
                  Falcon-512
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">94.98</span>
                <span className="text-muted-foreground">USDC</span>
              </div>
              <span className="text-sm text-muted-foreground">0 ETH · gas paid in USDC</span>
            </CardContent>
            <CardFooter className="justify-between text-sm">
              <span>5.00 USDC to 0x0000…dEaD</span>
              <Badge variant="success">Complete</Badge>
            </CardFooter>
          </Card>
          <div className="dark mt-4 ml-auto w-full max-w-sm rounded-xl border bg-background bg-lattice p-4 text-foreground shadow-2xl lg:-mr-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Under the hood</span>
              <span className="font-mono text-[11px] text-muted-foreground">Falcon VERIFY {proof.falconGas.toLocaleString()} gas</span>
            </div>
            <ItemGroup className="gap-2">
              {GATES.map((g) => (
                <Item key={g.name} size="xs" variant="outline">
                  <ItemMedia variant="icon">{g.admitted ? <CheckIcon /> : <XIcon />}</ItemMedia>
                  <ItemContent>
                    <ItemTitle>{g.name}</ItemTitle>
                    <ItemDescription className="font-mono text-xs">{g.rule}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant={g.admitted ? "success" : "destructive"}>{g.admitted ? "Admitted" : "Rejected"}</Badge>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </div>
        </motion.div>
      </div>
      <ProofStrip />
    </section>
  )
}

function ProofStrip() {
  const block = useBlockNumber()
  const stats = [
    { label: "Latest devnet block", value: block !== null ? `#${block.toLocaleString()}` : "…", live: true },
    { label: "Falcon check onchain", value: `${proof.falconGas.toLocaleString()} gas` },
    { label: "Network fee per payment", value: `≈ ${proof.feeUsdc} USDC` },
    { label: "ETH the sender spends", value: "0 wei" },
  ]
  return (
    <div className="border-t">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 border-r px-6 py-6 last:border-r-0 max-lg:nth-2:border-r-0 max-lg:nth-[-n+2]:border-b">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {s.live && <span className="size-1.5 animate-pulse rounded-full bg-success" />}
              {s.label}
            </dt>
            <dd className="font-mono text-xl tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

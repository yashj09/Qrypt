import { AtomIcon, CoinsIcon, WaypointsIcon, type LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Section, SectionHeading } from "@/components/landing/section"

const POINTS: { icon: LucideIcon; today: string; title: string; answer: string }[] = [
  {
    icon: CoinsIcon,
    today: "You need ETH to move dollars",
    title: "Gas paid in USDC",
    answer: "A paymaster fronts the gas and is repaid in USDC inside the same transaction. A new account holds 0 ETH and still pays.",
  },
  {
    icon: AtomIcon,
    today: "ECDSA keys fall to a large quantum computer",
    title: "A post-quantum signature",
    answer: "Every transaction is authorized by Falcon-512, the lattice scheme NIST selected as FN-DSA, checked onchain. There's no ECDSA key at all.",
  },
  {
    icon: WaypointsIcon,
    today: "Smart wallets lean on bundlers and relayers",
    title: "One native transaction",
    answer: "An EIP-8141 frame transaction carries the signature check, the gas payment and the transfer. No bundler, relayer or paymaster server.",
  },
]

export function Why() {
  return (
    <Section id="why">
      <SectionHeading eyebrow="Why Qrypt" title={<>Stablecoins should <em>feel like money.</em></>}>
        Sending dollars onchain still means buying a second token for gas and trusting a key that quantum computers are
        expected to break. Qrypt removes both.
      </SectionHeading>
      <div className="grid gap-6 md:grid-cols-3">
        {POINTS.map((p) => (
          <Card key={p.title}>
            <CardHeader>
              <CardDescription className="line-through decoration-muted-foreground/50">{p.today}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Separator />
              <div className="flex items-center gap-2">
                <p.icon className="size-5" />
                <CardTitle>{p.title}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">{p.answer}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  )
}

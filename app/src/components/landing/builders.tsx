import { ArrowUpRightIcon, FileCodeIcon, PackageIcon, ServerIcon, WalletIcon, type LucideIcon } from "lucide-react"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Section, SectionHeading } from "@/components/landing/section"
import { links } from "@/lib/site"

const PIECES: { icon: LucideIcon; title: string; body: string; href: string }[] = [
  { icon: WalletIcon, title: "QPayAccount.sol", body: "Falcon-512 account. VERIFY frame checks the signature, then approves execution.", href: links.contracts },
  { icon: FileCodeIcon, title: "UsdcPaymaster.sol", body: "Approves payment only if the next frame repays the quote in USDC.", href: links.contracts },
  { icon: PackageIcon, title: "@qpay/frametx", body: "TypeScript builder, signer glue and submit helpers for the devnet frame format.", href: links.frametx },
  { icon: ServerIcon, title: "BUDGET-010 sidecar rule", body: "Per-entity, stake-gated validation budgets for the ERC-8421 mempool, with tests.", href: links.sidecarFork },
]

const SNIPPET = `const tx = buildQPayTx({ account, paymaster, usdc, recipient, amount, nonceSeq, ...fees })
const signed = await signQPay(tx, (digest) => falcon.sign(digest))
await submitAlt(endpoints, signed) // eth_sendFrameTransaction`

export function Builders() {
  return (
    <Section id="builders" className="border-t">
      <SectionHeading eyebrow="For builders" title={<>Built in the <em>open.</em></>}>
        Any wallet can adopt the same account, paymaster and mempool rule. Everything is MIT licensed.
      </SectionHeading>
      <div className="grid gap-6 lg:grid-cols-2">
        <ItemGroup className="min-w-0">
          {PIECES.map((p) => (
            <Item key={p.title} variant="outline" render={<a href={p.href} target="_blank" rel="noreferrer" />}>
              <ItemMedia variant="icon">
                <p.icon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="font-mono">{p.title}</ItemTitle>
                <ItemDescription>{p.body}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ArrowUpRightIcon className="size-4 text-muted-foreground" />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
        <div className="dark flex min-w-0 flex-col gap-3 rounded-2xl border bg-background p-6 text-foreground">
          <span className="font-mono text-xs text-muted-foreground">send.ts</span>
          <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed whitespace-pre text-foreground/90">{SNIPPET}</pre>
        </div>
      </div>
    </Section>
  )
}

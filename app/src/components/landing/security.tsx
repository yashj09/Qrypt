import { CheckIcon, CircleDashedIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Section, SectionHeading } from "@/components/landing/section"

const REAL = [
  "Every payment runs on the public EIP-8141 devnet and lands in a block you can inspect",
  "The Falcon private key is generated in your browser and never sent anywhere",
  "Mempool verdicts, frame gas and balances in the app are live responses, not mocks",
  "Key backups are encrypted in the browser, and restoring checks the key against the account onchain",
  "Account, paymaster, client and sidecar rule are open source under MIT",
]

const NOT_YET = [
  "Devnet only, with test USDC. Nothing here touches mainnet",
  "The ZKNOX falcon8 verifier is experimental and unaudited. Swapping it is one immutable address",
  "Each account locks 0.02 ETH of refundable stake to earn the larger validation budget",
  "Lose both the browser and the backup file and the account is gone: there are no guardians or social recovery yet",
  "The extension isn't in the Chrome Web Store; you load it unpacked",
  "The paymaster charges the maximum fee and doesn't refund unused gas yet",
]

export function Security() {
  return (
    <Section id="security">
      <SectionHeading eyebrow="Security" title={<>What's real, <em>and what isn't yet.</em></>}>
        A payments product earns trust by being precise about its limits. Here is ours.
      </SectionHeading>
      <div className="grid gap-6 md:grid-cols-2">
        <List title="Real today" items={REAL} done />
        <List title="Not yet" items={NOT_YET} />
      </div>
    </Section>
  )
}

function List({ title, items, done }: { title: string; items: string[]; done?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-1">
          {items.map((t) => (
            <Item key={t} size="xs">
              <ItemMedia variant="icon">{done ? <CheckIcon className="text-success" /> : <CircleDashedIcon className="text-muted-foreground" />}</ItemMedia>
              <ItemContent>
                <ItemTitle className="font-normal text-pretty">{t}</ItemTitle>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

import {
  ArrowLeftRightIcon,
  BadgeCheckIcon,
  CoinsIcon,
  DownloadIcon,
  ExternalLinkIcon,
  HardDriveDownloadIcon,
  PlugIcon,
  RefreshCwIcon,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Section, SectionHeading } from "@/components/landing/section"

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ArrowLeftRightIcon, title: "Send and receive anything", body: "USDC, ETH and any ERC-20 you add. Receive with a QR code; history is read from the chain, so it follows you." },
  { icon: CoinsIcon, title: "Gas in USDC, always", body: "Every transaction repays its gas in USDC inside the same frame transaction. You never need to hold ETH." },
  { icon: PlugIcon, title: "A real browser wallet", body: "The Eyrie extension is a full wallet in your toolbar, with a fullscreen dashboard and a password-locked key (Touch ID where the browser supports it). Dapps find it through EIP-6963." },
  { icon: BadgeCheckIcon, title: "Sign in with Eyrie", body: "Messages and typed data are signed with Falcon-512. Dapps check them onchain through the account's ERC-1271." },
  { icon: HardDriveDownloadIcon, title: "Back up and restore", body: "A password-encrypted key file. Restoring checks onchain that the key still controls the account." },
  { icon: RefreshCwIcon, title: "Rotate or close", body: "Replace your Falcon key with a transaction the old key signs, or unstake and sweep everything in one transaction." },
]

export function Features() {
  return (
    <Section id="wallet" className="border-t">
      <SectionHeading eyebrow="The wallet" title={<>A whole wallet, <em>post-quantum all the way down.</em></>}>
        Payments are where it starts. Everything else a wallet does runs on the same Falcon-signed frame transactions.
      </SectionHeading>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title}>
            <CardHeader>
              <f.icon className="size-5" />
              <CardTitle>{f.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button nativeButton={false} render={<a href="/dapp" />}>
          Try a dapp with Eyrie
          <ExternalLinkIcon data-icon="inline-end" />
        </Button>
        <Button variant="outline" nativeButton={false} render={<a href="/eyrie-extension.zip" download />}>
          <DownloadIcon data-icon="inline-start" />
          Chrome extension
        </Button>
        <span className="text-sm text-muted-foreground">
          Unzip, open chrome://extensions, turn on Developer mode, then "Load unpacked". No extension? Dapps can still reach
          the web wallet through a popup.
        </span>
      </div>
    </Section>
  )
}

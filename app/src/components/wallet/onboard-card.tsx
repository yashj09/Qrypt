import { CheckIcon, KeyRoundIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import type { OnboardStage } from "@/lib/qpay"

const STAGES: { key: OnboardStage; title: string; detail: string }[] = [
  {
    key: "key",
    title: "Generate your Falcon key",
    detail: "Created in this browser. The private key never leaves your device.",
  },
  {
    key: "register",
    title: "Register the public key",
    detail: "Converted to the onchain verifier's format with a free read call.",
  },
  {
    key: "deploy",
    title: "Deploy your account",
    detail: "A factory deploys an account that accepts only this key, stakes it, and adds 100 test USDC.",
  },
]

interface Props {
  stage: OnboardStage | null
  disabled: boolean
  onCreate: () => void
  onRestore: () => void
}

export function OnboardCard({ stage, disabled, onCreate, onRestore }: Props) {
  const busy = stage !== null
  const current = stage ? STAGES.findIndex((s) => s.key === stage) : -1
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>About 15 seconds. No wallet extension, no ETH, nothing to install.</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup>
          {STAGES.map((s, i) => (
            <Item key={s.key} size="sm">
              <ItemMedia>
                <span className="flex size-7 items-center justify-center rounded-full border font-mono text-xs data-[state=active]:border-foreground data-[state=done]:border-success data-[state=done]:bg-success data-[state=done]:text-success-foreground"
                  data-state={i < current ? "done" : i === current ? "active" : "todo"}>
                  {i < current ? <CheckIcon className="size-3.5" /> : i === current ? <Spinner className="size-3.5" /> : i + 1}
                </span>
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{s.title}</ItemTitle>
                <ItemDescription className="line-clamp-none">{s.detail}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3">
        <Button size="lg" disabled={disabled || busy} onClick={onCreate}>
          {busy ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon data-icon="inline-start" />}
          {busy ? STAGES[current]?.title ?? "Working" : "Create my account"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onRestore}>
          I have a backup file
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Devnet only. The key lives in this browser's storage, so clearing site data loses the account.
        </p>
      </CardFooter>
    </Card>
  )
}

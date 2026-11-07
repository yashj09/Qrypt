import { useState } from "react"
import { CheckIcon, FingerprintIcon, KeyRoundIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import type { OnboardStage } from "@/lib/qpay"
import { ProtectionChoice, type Protection } from "@/components/vault/protection-choice"

const ALL_STAGES: { key: OnboardStage; title: string; detail: string }[] = [
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
    key: "human",
    title: "Prove you're a unique human",
    detail:
      "Your account is free: we stake 0.02 ETH and add 100 test USDC. World ID keeps that to one per person. We only get an anonymous ID, nothing about you.",
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
  /** This device has no vault yet, so creating asks how to protect the key first (Face ID or a password). */
  needsVault: boolean
  onCreate: (protection?: Protection) => Promise<void>
  onRestore: () => void
  /** Face ID recovery, offered when this device has no vault and the browser supports passkeys. */
  onRecover?: () => Promise<void>
  /** The server requires World ID for a new sponsored account. */
  humanCheck?: boolean
}

export function OnboardCard({ stage, disabled, needsVault, onCreate, onRestore, onRecover, humanCheck }: Props) {
  const STAGES = ALL_STAGES.filter((s) => s.key !== "human" || humanCheck)
  const busy = stage !== null
  const [recovering, setRecovering] = useState(false)
  const [recoverError, setRecoverError] = useState<string | null>(null)
  const recover = async () => {
    if (!onRecover) return
    setRecovering(true)
    setRecoverError(null)
    try {
      await onRecover()
    } catch (e) {
      setRecoverError((e as Error).message)
    } finally {
      setRecovering(false)
    }
  }
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
        {needsVault && !busy ? (
          <ProtectionChoice action="Create" disabled={disabled} onChosen={(p) => onCreate(p)} />
        ) : (
          <Button size="lg" disabled={disabled || busy} onClick={() => void onCreate()}>
            {busy ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon data-icon="inline-start" />}
            {busy ? STAGES[current]?.title ?? "Working" : "Create my account"}
          </Button>
        )}
        {needsVault && onRecover && (
          <Button variant="outline" disabled={busy || recovering || disabled} onClick={recover}>
            {recovering ? <Spinner data-icon="inline-start" /> : <FingerprintIcon data-icon="inline-start" />}
            I already have Qrypt: recover with Face ID
          </Button>
        )}
        {recoverError && <p className="text-center text-sm text-destructive">{recoverError}</p>}
        <Button variant="ghost" disabled={busy} onClick={onRestore}>
          I have a backup file
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Devnet only. Your key is encrypted on this device; back it up from Settings once you're in.
        </p>
      </CardFooter>
    </Card>
  )
}

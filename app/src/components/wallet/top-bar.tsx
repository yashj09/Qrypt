import { useState, type ReactNode } from "react"
import { CheckIcon, CopyIcon, PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react"
import type { Address } from "viem"
import { Wordmark } from "@/components/brand/logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useBlockNumber } from "@/hooks/use-block-number"
import { short } from "@/lib/format"

interface Props {
  account: Address | null
  inspectorOpen: boolean
  onToggleInspector: () => void
  mobileInspector: ReactNode
}

export function TopBar({ account, inspectorOpen, onToggleInspector, mobileInspector }: Props) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-6">
        <a href="/" aria-label="Eyrie home">
          <Wordmark />
        </a>
        <div className="flex items-center gap-2">
          <NetworkBadge />
          {account && <AccountChip account={account} />}
          <Button variant="ghost" size="sm" className="hidden lg:inline-flex" onClick={onToggleInspector}>
            {inspectorOpen ? <PanelRightCloseIcon data-icon="inline-start" /> : <PanelRightOpenIcon data-icon="inline-start" />}
            Under the hood
          </Button>
          {mobileInspector}
        </div>
      </div>
    </header>
  )
}

export function NetworkBadge() {
  const block = useBlockNumber()
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className="size-1.5 animate-pulse rounded-full bg-success" />
      Devnet
      {block !== null && <span className="hidden font-mono text-muted-foreground tabular-nums sm:inline">#{block}</span>}
    </Badge>
  )
}

function AccountChip({ account }: { account: Address }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(account).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <Button variant="outline" size="sm" className="font-mono" onClick={copy}>
      {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
      {short(account, 4)}
    </Button>
  )
}

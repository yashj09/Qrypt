import { useState } from "react"
import { ArrowDownLeftIcon, CheckIcon, CopyIcon, HistoryIcon, SendIcon } from "lucide-react"
import type { Address } from "viem"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { short, units } from "@/lib/format"

interface Props {
  account: Address
  usdc: bigint | undefined
  onSend: () => void
  onReceive: () => void
  onActivity?: () => void
  className?: string
}

/** The coloured card at the top of the wallet: balance, address and the everyday actions. */
export function BalanceHero({ account, usdc, onSend, onReceive, onActivity, className }: Props) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(account).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  return (
    <div className={cn("flex flex-col gap-5 rounded-2xl bg-aurora p-5 text-white shadow-lg", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/75">Balance</span>
        <Button variant="ghost" size="xs" className="font-mono text-white/80 hover:bg-white/10 hover:text-white" onClick={copy}>
          {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
          {short(account, 4)}
        </Button>
      </div>
      <div className="flex items-baseline gap-2">
        {usdc !== undefined ? (
          <span className="text-4xl font-semibold tracking-tight tabular-nums">{units(usdc, 6)}</span>
        ) : (
          <Skeleton className="h-10 w-40 bg-white/10" />
        )}
        <span className="text-white/70">USDC</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill icon={<SendIcon />} label="Send" onClick={onSend} />
        <Pill icon={<ArrowDownLeftIcon />} label="Receive" onClick={onReceive} />
        {onActivity && <Pill icon={<HistoryIcon />} label="Activity" onClick={onActivity} />}
      </div>
    </div>
  )
}

function Pill({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white [&_svg]:text-white"
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  )
}

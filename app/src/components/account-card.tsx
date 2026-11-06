import { AtomIcon, ShieldCheckIcon } from "lucide-react"
import type { Address } from "viem"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import type { Balances } from "@/lib/qpay"
import { eth, short, usdc } from "@/lib/format"

interface Props {
  account: Address
  balances: Balances | null
  onForget: () => void
}

export function AccountCard({ account, balances, onForget }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your quantum-safe account</CardTitle>
        <CardDescription className="font-mono">{short(account, 10)}</CardDescription>
        <CardAction>
          <Badge variant="secondary">
            <AtomIcon data-icon="inline-start" />
            Falcon-512
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="USDC" value={balances ? usdc(balances.usdc) : null} />
          <Stat label="Spendable ETH" value={balances ? eth(balances.eth) : null} />
        </div>
        <Separator />
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <ShieldCheckIcon className="text-foreground" />
            No ECDSA key. Every transaction is authorized by a Falcon-512 signature checked onchain. The key lives only in
            this browser.
          </p>
          <p>
            Refundable stake in the ERC-8421 registry: {balances ? eth(balances.stake) : "…"}. Stake is what earns the
            account the alt mempool's larger validation gas budget.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" size="sm" onClick={onForget}>
          Start over with a new key
        </Button>
      </CardFooter>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {value ? <span className="text-2xl font-semibold tabular-nums">{value}</span> : <Skeleton className="h-8 w-28" />}
    </div>
  )
}

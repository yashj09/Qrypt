import { AtomIcon } from "lucide-react"
import { motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Balances } from "@/lib/qpay"
import { eth, usdcAmount } from "@/lib/format"

interface Props {
  balances: Balances | null
  onForget: () => void
}

export function BalanceCard({ balances, onForget }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Balance</CardDescription>
        <CardAction>
          <Badge variant="secondary">
            <AtomIcon data-icon="inline-start" />
            Falcon-512
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {balances ? (
          <div className="flex items-baseline gap-2">
            <motion.span
              key={balances.usdc.toString()}
              initial={{ opacity: 0.4, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl font-semibold tracking-tight tabular-nums"
            >
              {usdcAmount(balances.usdc)}
            </motion.span>
            <span className="text-lg text-muted-foreground">USDC</span>
          </div>
        ) : (
          <Skeleton className="h-12 w-48" />
        )}
        <p className="text-sm text-muted-foreground">
          {balances ? eth(balances.eth) : "…"} in this account. Gas is paid in USDC, so you never need ETH.
        </p>
      </CardContent>
      <CardFooter className="justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {balances ? eth(balances.stake) : "…"} refundable stake for the larger validation budget
        </span>
        <Button variant="ghost" size="sm" onClick={onForget}>
          New key
        </Button>
      </CardFooter>
    </Card>
  )
}

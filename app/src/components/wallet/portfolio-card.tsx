import { AtomIcon, PlusIcon, QrCodeIcon } from "lucide-react"
import { motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { assetDecimals, assetKey, assetSymbol, type Asset, type Holdings } from "@/lib/assets"
import { eth, units } from "@/lib/format"

interface Props {
  assets: Asset[]
  holdings: Holdings | null
  stake: bigint | null
  onReceive: () => void
  onAddToken: () => void
}

export function PortfolioCard({ assets, holdings, stake, onReceive, onAddToken }: Props) {
  const [usdc, ...rest] = assets
  const usdcBalance = holdings?.[assetKey(usdc)]
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
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          {usdcBalance !== undefined ? (
            <div className="flex items-baseline gap-2">
              <motion.span
                key={usdcBalance.toString()}
                initial={{ opacity: 0.4, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-5xl font-semibold tracking-tight tabular-nums"
              >
                {units(usdcBalance, 6)}
              </motion.span>
              <span className="text-lg text-muted-foreground">USDC</span>
            </div>
          ) : (
            <Skeleton className="h-12 w-48" />
          )}
          <p className="text-sm text-muted-foreground">Gas is paid in USDC, so you never need ETH.</p>
        </div>
        <Separator />
        <ItemGroup className="gap-1">
          {rest.map((a) => {
            const balance = holdings?.[assetKey(a)]
            return (
              <Item key={assetKey(a)} size="xs">
                <ItemMedia>
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted font-mono text-xs">
                    {assetSymbol(a).slice(0, 2)}
                  </span>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{assetSymbol(a)}</ItemTitle>
                  <ItemDescription className="font-mono text-xs">
                    {a.kind === "eth" ? "Native" : `${a.address.slice(0, 8)}…${a.address.slice(-4)}`}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="font-mono tabular-nums">
                  {balance !== undefined ? units(balance, assetDecimals(a)) : <Skeleton className="h-4 w-12" />}
                </ItemActions>
              </Item>
            )
          })}
        </ItemGroup>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onReceive}>
            <QrCodeIcon data-icon="inline-start" />
            Receive
          </Button>
          <Button variant="outline" onClick={onAddToken}>
            <PlusIcon data-icon="inline-start" />
            Add token
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {stake !== null ? eth(stake) : "…"} refundable stake earns the larger validation budget
        </span>
      </CardFooter>
    </Card>
  )
}

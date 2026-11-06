import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { assetDecimals, assetKey, assetSymbol, type Asset, type Holdings } from "@/lib/assets"
import { units } from "@/lib/format"

/** Every asset the wallet knows, with its balance. */
export function AssetList({ assets, holdings }: { assets: Asset[]; holdings: Holdings | null }) {
  return (
    <ItemGroup className="gap-2">
      {assets.map((a) => {
        const balance = holdings?.[assetKey(a)]
        return (
          <Item key={assetKey(a)} variant="muted" size="sm">
            <ItemMedia>
              <span className="flex size-9 items-center justify-center rounded-full bg-background font-mono text-xs">{assetSymbol(a).slice(0, 2)}</span>
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{assetSymbol(a)}</ItemTitle>
              <ItemDescription className="font-mono text-xs">{a.kind === "eth" ? "Native" : `${a.address.slice(0, 8)}…${a.address.slice(-4)}`}</ItemDescription>
            </ItemContent>
            <ItemActions className="font-mono tabular-nums">
              {balance !== undefined ? units(balance, assetDecimals(a)) : <Skeleton className="h-4 w-12" />}
            </ItemActions>
          </Item>
        )
      })}
    </ItemGroup>
  )
}

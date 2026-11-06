import { ArrowUpRightIcon, HistoryIcon, ShieldAlertIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { endpoints } from "@/lib/qpay"
import { PHASE_BADGE, SCENARIO_LABEL, type ActivityEntry } from "@/lib/run"
import { explorerTx } from "@/lib/site"
import { ago, short, usdcAmount } from "@/lib/format"

export function Activity({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HistoryIcon />
              </EmptyMedia>
              <EmptyTitle>No payments yet</EmptyTitle>
              <EmptyDescription>Your payments and stress tests show up here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup>
            {entries.map((e) => {
              const node = (e.via === "stock" && endpoints.stockAltMempool) || endpoints.altMempool
              const title = e.scenario === "send" ? `${usdcAmount(BigInt(e.amount))} USDC to ${short(e.recipient, 4)}` : SCENARIO_LABEL[e.scenario]
              return (
                <Item key={e.hash} size="sm" variant="outline" render={e.phase === "included" ? <a href={explorerTx(e.hash, node)} target="_blank" rel="noreferrer" /> : undefined}>
                  <ItemMedia variant="icon">{e.scenario === "send" ? <ArrowUpRightIcon /> : <ShieldAlertIcon />}</ItemMedia>
                  <ItemContent>
                    <ItemTitle>{title}</ItemTitle>
                    <ItemDescription>
                      {ago(e.at)}
                      {e.block ? ` · block ${e.block}` : ""}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant={PHASE_BADGE[e.phase].variant}>{PHASE_BADGE[e.phase].label}</Badge>
                  </ItemActions>
                </Item>
              )
            })}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}

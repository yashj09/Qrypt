import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  HistoryIcon,
  ShieldAlertIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { endpoints } from "@/lib/qpay"
import { formatAsset, type TokenTransfer } from "@/lib/assets"
import { PHASE_BADGE, type ActivityEntry } from "@/lib/run"
import { NODE_RPC, explorerTx } from "@/lib/site"
import { ago, short } from "@/lib/format"

interface Props {
  /** Just the list, for screens that already have their own heading. */
  bare?: boolean
  /** Names for known contracts, e.g. the staking registry, keyed by lowercase address. */
  names?: Record<string, string>
  /** Attempts from this browser that never landed: rejections, drops, and ones still pending. */
  local: ActivityEntry[]
  /** Token transfers in and out of the account, read from chain logs. */
  transfers: TokenTransfer[] | null
}

export function Activity({ bare, local, transfers, names = {} }: Props) {
  const unfinished = local.filter((e) => e.phase !== "included")
  const empty = unfinished.length === 0 && transfers?.length === 0
  const list = empty ? (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HistoryIcon />
        </EmptyMedia>
        <EmptyTitle>No activity yet</EmptyTitle>
        <EmptyDescription>Payments in and out show up here.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ) : (
    <ItemGroup>
      {unfinished.map((e) => (
        <Item key={e.hash} size="sm" variant="outline">
          <ItemMedia variant="icon">
            <ShieldAlertIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{e.title}</ItemTitle>
            <ItemDescription>{ago(e.at)} · not onchain</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Badge variant={PHASE_BADGE[e.phase].variant}>
              {PHASE_BADGE[e.phase].label}
            </Badge>
          </ItemActions>
        </Item>
      ))}
      {transfers?.slice(0, 15).map((t) => {
        const incoming = t.direction === "in"
        const node =
          local.find((e) => e.hash === t.hash)?.via === "stock"
            ? endpoints.stockAltMempool
            : NODE_RPC
        return (
          <Item
            key={`${t.hash}-${t.logIndex}`}
            size="sm"
            variant="outline"
            render={
              <a
                href={explorerTx(t.hash, node ?? NODE_RPC)}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <ItemMedia variant="icon">
              {incoming ? <ArrowDownLeftIcon /> : <ArrowUpRightIcon />}
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                {incoming ? "Received" : "Sent"}{" "}
                {formatAsset(t.asset, t.amount)}
              </ItemTitle>
              <ItemDescription>
                {incoming ? "from" : "to"}{" "}
                <Counterparty address={t.counterparty} names={names} /> · block{" "}
                {t.block.toString()}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge variant={incoming ? "success" : "outline"}>
                {incoming ? "In" : "Out"}
              </Badge>
            </ItemActions>
          </Item>
        )
      })}
    </ItemGroup>
  )
  if (bare) return list
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          Read from the chain, so it follows your account to any device.
        </CardDescription>
      </CardHeader>
      <CardContent>{list}</CardContent>
    </Card>
  )
}

function Counterparty({
  address,
  names,
}: {
  address: string
  names: Record<string, string>
}) {
  const name = names[address.toLowerCase()]
  return name ? (
    <span>{name}</span>
  ) : (
    <span className="font-mono">{short(address, 4)}</span>
  )
}

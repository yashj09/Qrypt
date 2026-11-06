import { Badge } from "@/components/ui/badge"
import { useBlockNumber } from "@/hooks/use-block-number"

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

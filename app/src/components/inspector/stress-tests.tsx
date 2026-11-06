import { CoinsIcon, ShieldAlertIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import type { Scenario } from "@/lib/qpay"

const TESTS: { scenario: Exclude<Scenario, "send">; title: string; icon: LucideIcon; expect: string }[] = [
  {
    scenario: "tamper",
    title: "Tamper with the signature",
    icon: ShieldAlertIcon,
    expect:
      "Flips one bit of the Falcon signature after signing. Frame 0 reverts with BadFalconSignature before approving, so every mempool rejects it and nobody pays.",
  },
  {
    scenario: "underpay",
    title: "Underpay the gas fee",
    icon: CoinsIcon,
    expect:
      "The repay frame offers a tenth of the quote. The paymaster's VERIFY frame reverts with FeeTooLow before approving payment.",
  },
]

interface Props {
  busy: Scenario | null
  disabled: boolean
  onRun: (scenario: Scenario) => void
}

export function StressTests({ busy, disabled, onRun }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Each test sends 1 USDC with one thing broken. Validation runs before anyone is charged, so a broken transaction costs
        you nothing.
      </p>
      <ItemGroup>
        {TESTS.map((t) => (
          <Item key={t.scenario} variant="outline">
            <ItemMedia variant="icon">
              <t.icon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t.title}</ItemTitle>
              <ItemDescription className="line-clamp-none">{t.expect}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="outline" size="sm" disabled={disabled || busy !== null} onClick={() => onRun(t.scenario)}>
                {busy === t.scenario && <Spinner data-icon="inline-start" />}
                Run
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </div>
  )
}

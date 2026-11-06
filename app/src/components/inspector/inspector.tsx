import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Frames } from "@/components/inspector/frames"
import { Gates } from "@/components/inspector/gates"
import { StressTests } from "@/components/inspector/stress-tests"
import type { Scenario } from "@/lib/qpay"
import type { Run } from "@/lib/run"

export type InspectorTab = "mempools" | "frames" | "stress"

interface Props {
  run: Run | null
  tab: InspectorTab
  onTab: (tab: InspectorTab) => void
  busy: Scenario | null
  canRun: boolean
  onStress: (scenario: Scenario) => void
}

export function Inspector({ run, tab, onTab, busy, canRun, onStress }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Under the hood</span>
        <h2 className="text-lg font-semibold tracking-tight">One EIP-8141 frame transaction</h2>
        <p className="text-sm text-muted-foreground">
          No bundler, no relayer, no paymaster server. Validation is code running in VERIFY frames, and this is what the
          network sees.
        </p>
      </div>
      <Tabs value={tab} onValueChange={(v) => onTab(v as InspectorTab)}>
        <TabsList variant="line">
          <TabsTrigger value="mempools">Mempools</TabsTrigger>
          <TabsTrigger value="frames">Frames and gas</TabsTrigger>
          <TabsTrigger value="stress">Stress tests</TabsTrigger>
        </TabsList>
        <TabsContent value="mempools" className="pt-4">
          <Gates run={run} />
        </TabsContent>
        <TabsContent value="frames" className="pt-4">
          <Frames run={run} />
        </TabsContent>
        <TabsContent value="stress" className="pt-4">
          <StressTests busy={busy} disabled={!canRun} onRun={onStress} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

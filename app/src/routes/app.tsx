import { useState } from "react"
import { AlertCircleIcon, InfoIcon, PanelRightOpenIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Inspector } from "@/components/inspector/inspector"
import { Activity } from "@/components/wallet/activity"
import { AddTokenDialog } from "@/components/wallet/add-token-dialog"
import { KeyCard } from "@/components/wallet/key-card"
import { PortfolioCard } from "@/components/wallet/portfolio-card"
import { ReceiveDialog } from "@/components/wallet/receive-dialog"
import { RestoreDialog } from "@/components/wallet/restore-dialog"
import { OnboardCard } from "@/components/wallet/onboard-card"
import { SendCard } from "@/components/wallet/send-card"
import { TopBar } from "@/components/wallet/top-bar"
import { TransferStatus } from "@/components/wallet/transfer-status"
import { useWallet } from "@/hooks/use-wallet"
import { cn } from "@/lib/utils"

export default function AppPage() {
  const w = useWallet()
  const { deployment, account, wallet, assets, fee, names, notice, error, stage, busy, run, activity, tab, setTab, actions } = w
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [addTokenOpen, setAddTokenOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)

  const inspector = (
    <Inspector
      run={run}
      tab={tab}
      onTab={setTab}
      busy={busy}
      canRun={!!deployment && !!account}
      onStress={actions.stress}
    />
  )

  return (
    <div className="flex min-h-svh flex-col">
      <TopBar
        account={account}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((o) => !o)}
        mobileInspector={
          <Sheet>
            <SheetTrigger render={<Button variant="outline" size="icon-sm" className="lg:hidden" aria-label="Under the hood" />}>
              <PanelRightOpenIcon />
            </SheetTrigger>
            <SheetContent side="bottom" className="dark max-h-[85svh] overflow-y-auto bg-lattice p-6">
              <SheetHeader className="sr-only">
                <SheetTitle>Under the hood</SheetTitle>
              </SheetHeader>
              {inspector}
            </SheetContent>
          </Sheet>
        }
      />
      <div className={cn("grid flex-1", inspectorOpen && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]")}>
        <main className="flex justify-center px-4 py-8 lg:px-8 lg:py-12">
          <div className="flex w-full max-w-md flex-col gap-6">
            {notice && (
              <Alert>
                <InfoIcon />
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription className="break-all">{error}</AlertDescription>
              </Alert>
            )}
            {account ? (
              <>
                <PortfolioCard
                  assets={assets}
                  holdings={wallet?.holdings ?? null}
                  stake={wallet?.balances.stake ?? null}
                  onReceive={() => setReceiveOpen(true)}
                  onAddToken={() => setAddTokenOpen(true)}
                />
                <SendCard
                  assets={assets}
                  holdings={wallet?.holdings ?? null}
                  fee={fee}
                  sending={busy === "send"}
                  disabled={!deployment || busy !== null}
                  onSend={actions.send}
                />
                {run && <TransferStatus run={run} />}
                <Activity local={activity} transfers={wallet?.transfers ?? null} names={names} />
                <KeyCard
                  busy={busy !== null}
                  onBackup={actions.backup}
                  onRotate={actions.rotate}
                  onClose={actions.close}
                  onForget={actions.forget}
                />
                {deployment && (
                  <>
                    <ReceiveDialog
                      open={receiveOpen}
                      onOpenChange={setReceiveOpen}
                      account={account}
                      chainId={deployment.chainId}
                      assets={assets}
                    />
                    <AddTokenDialog
                      open={addTokenOpen}
                      onOpenChange={setAddTokenOpen}
                      onAdd={actions.addToken}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <OnboardCard stage={stage} disabled={!deployment} onCreate={actions.create} onRestore={() => setRestoreOpen(true)} />
                <RestoreDialog open={restoreOpen} onOpenChange={setRestoreOpen} onRestore={actions.restore} />
              </>
            )}
          </div>
        </main>
        {inspectorOpen && (
          <aside className="dark hidden border-l bg-lattice px-6 py-8 lg:block lg:px-10 lg:py-12">
            <div className="sticky top-20 max-w-2xl">{inspector}</div>
          </aside>
        )}
      </div>
    </div>
  )
}

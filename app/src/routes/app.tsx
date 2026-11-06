import { useEffect, useState } from "react"
import { registerServiceWorker, setThemeColor } from "@/lib/pwa"
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
import { useMediaQuery } from "@/hooks/use-media-query"
import { MobileWallet } from "@/components/mobile/mobile-wallet"
import { parsePaymentRequest } from "@/lib/payment-request"
import { useVaultState } from "@/components/vault/use-vault"
import { WebVaultGate } from "@/components/vault/web-vault-gate"
import { UnlockMethodsCard } from "@/components/vault/unlock-methods-card"
import type { Protection } from "@/components/vault/protection-choice"
import { openBackup } from "@/lib/keys"
import { storeAccount } from "@/lib/qpay"
import { webVault } from "@/lib/vault/web"
import { askPasskey, passkeysAllowedHere } from "@/lib/passkey"
import { recoverWithPasskey, uploadRecovery } from "@/lib/recovery"
import { RecoveryStatus } from "@/components/vault/recovery-status"
import { NotificationsCard } from "@/components/wallet/notifications-card"
import { cn } from "@/lib/utils"

export default function AppPage() {
  const phone = useMediaQuery("(max-width: 767px)")
  // Phones get the dark wallet (like the extension); desktop keeps the light one with the dark inspector.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", phone)
    setThemeColor(phone ? "#0c0d0f" : "#f9f7f3")
  }, [phone])
  useEffect(registerServiceWorker, [])
  return (
    <WebVaultGate>
      <WalletPage />
    </WebVaultGate>
  )
}

function WalletPage() {
  const w = useWallet()
  const { deployment, account, wallet, assets, fee, names, notice, error, stage, busy, run, activity, tab, setTab, actions } = w
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [addTokenOpen, setAddTokenOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const vaultState = useVaultState(webVault)
  const phone = useMediaQuery("(max-width: 767px)")
  const [payRequest] = useState(() => (window.location.pathname.replace(/\/+$/, "") === "/pay" ? parsePaymentRequest(window.location.href) ?? undefined : undefined))
  const needsVault = vaultState === "none"

  const create = async (protection?: Protection) => {
    if (!deployment) throw new Error("Still connecting to the network. Try again in a moment.")
    if (protection) await webVault.create(protection)
    const created = await actions.create()
    if (created && protection && "passkey" in protection) {
      await uploadRecovery(created, protection.passkey, (await webVault.keyStore.seed())!).catch((e) =>
        w.setNotice(`Account created, but Face ID recovery wasn't saved: ${(e as Error).message}. Save it from Settings.`),
      )
    }
  }

  const recover = async () => {
    if (!deployment) throw new Error("Still connecting to the network. Try again in a moment.")
    const { account: recovered, seed, passkey } = await recoverWithPasskey(deployment)
    await webVault.create({ passkey })
    await webVault.keyStore.save(seed)
    storeAccount(deployment, recovered)
    actions.reload()
    w.setNotice("Recovered with Face ID and checked onchain. This device now controls your account.")
  }

  /** Rotation changes the seed, so the Face ID recovery record must be re-saved under the new key. */
  const rotate = async () => {
    const before = await webVault.keyStore.seed()
    await actions.rotate()
    const after = await webVault.keyStore.seed()
    const passkey = await webVault.passkey()
    if (account && after && after !== before && passkey) {
      w.setNotice("Key rotated. Confirm with Face ID to update your recovery…")
      try {
        await uploadRecovery(account, await askPasskey(passkey.credentialId), after)
        w.setNotice("Key rotated and Face ID recovery updated. Old backup files no longer work: make a new one.")
      } catch (e) {
        w.setNotice(`Key rotated, but Face ID recovery wasn't updated (${(e as Error).message}). Save it from Settings.`)
      }
    }
  }

  const restore = async (file: File, password: string, protection?: Protection) => {
    if (!deployment) return
    const { account: restored, seed } = await openBackup(deployment, file, password)
    if (protection) await webVault.create(protection)
    await webVault.keyStore.save(seed)
    storeAccount(deployment, restored)
    actions.reload()
  }

  const settings = account && (
    <>
      <UnlockMethodsCard
        vault={webVault}
        onPasskeyAdded={async (key) => account && uploadRecovery(account, key, (await webVault.keyStore.seed())!)}
        footer={<RecoveryStatus account={account} />}
      />
      {account && <NotificationsCard account={account} />}
      <KeyCard busy={busy !== null} onBackup={actions.backup} onRotate={rotate} onClose={actions.close} onForget={actions.forget} />
    </>
  )

  if (phone && account) {
    return <MobileWallet w={w} account={account} request={payRequest} onLock={() => void webVault.lock()} settings={settings} />
  }

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
        onLock={() => void webVault.lock()}
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
                  initial={payRequest}
                  assets={assets}
                  holdings={wallet?.holdings ?? null}
                  fee={fee}
                  sending={busy === "send"}
                  disabled={!deployment || busy !== null}
                  onSend={actions.send}
                />
                {run && <TransferStatus run={run} />}
                <Activity local={activity} transfers={wallet?.transfers ?? null} names={names} />
                {settings}
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
                <OnboardCard
                  stage={stage}
                  disabled={!deployment}
                  needsVault={needsVault}
                  onCreate={create}
                  onRestore={() => setRestoreOpen(true)}
                  onRecover={passkeysAllowedHere() ? recover : undefined}
                />
                <RestoreDialog open={restoreOpen} onOpenChange={setRestoreOpen} needsVault={needsVault} onRestore={restore} />
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

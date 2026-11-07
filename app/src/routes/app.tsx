import { useEffect, useState } from "react"
import { AlertCircleIcon, InfoIcon } from "lucide-react"
import { Wordmark } from "@/components/brand/logo"
import { WalletDashboard } from "@/components/dashboard/wallet-dashboard"
import { MobileWallet } from "@/components/mobile/mobile-wallet"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { Protection } from "@/components/vault/protection-choice"
import { RecoveryStatus } from "@/components/vault/recovery-status"
import { UnlockMethodsCard } from "@/components/vault/unlock-methods-card"
import { useVaultState } from "@/components/vault/use-vault"
import { WebVaultGate } from "@/components/vault/web-vault-gate"
import { KeyCard } from "@/components/wallet/key-card"
import { NotificationsCard } from "@/components/wallet/notifications-card"
import { OnboardCard } from "@/components/wallet/onboard-card"
import { RestoreDialog } from "@/components/wallet/restore-dialog"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useWallet } from "@/hooks/use-wallet"
import { WorldIssue } from "@/components/world/world-issue"
import { useWorldGate, useWorldProof } from "@/components/world/use-world-proof"
import { WorldIdError } from "@/lib/world"
import type { Address } from "viem"
import { openBackup } from "@/lib/keys"
import { askPasskey, passkeysAllowedHere } from "@/lib/passkey"
import { parsePaymentRequest } from "@/lib/payment-request"
import { registerServiceWorker, useDarkWallet } from "@/lib/pwa"
import { storeAccount } from "@/lib/qpay"
import { recoverWithPasskey, uploadRecovery } from "@/lib/recovery"
import { webVault } from "@/lib/vault/web"

export default function AppPage() {
  // The wallet is dark everywhere, like the extension; only the landing page is light.
  useDarkWallet()
  useEffect(registerServiceWorker, [])
  return (
    <>
      {OLD_HOST && <MovedBanner />}
      <WebVaultGate>
        <WalletPage />
      </WebVaultGate>
    </>
  )
}

/** Keys live in this origin's storage, so /app stays reachable on the old host and asks people to move by backup. */
const OLD_HOST = window.location.hostname === "qpay-psi.vercel.app"

function MovedBanner() {
  return (
    <Alert className="rounded-none border-x-0 border-t-0">
      <AlertTitle>Qrypt moved to qrypt.money</AlertTitle>
      <AlertDescription>
        Your key stays on this site. To move it, make a backup file in Settings here, then restore it at{" "}
        <a className="underline" href="https://www.qrypt.money/app">
          qrypt.money
        </a>
        , where Face ID unlock, recovery and notifications work.
      </AlertDescription>
    </Alert>
  )
}

function WalletPage() {
  const w = useWallet()
  const { deployment, account, notice, error, stage, busy, actions } = w
  const [restoreOpen, setRestoreOpen] = useState(false)
  const vaultState = useVaultState(webVault)
  const phone = useMediaQuery("(max-width: 767px)")
  const [payRequest] = useState(() => (window.location.pathname.replace(/\/+$/, "") === "/pay" ? parsePaymentRequest(window.location.href) ?? undefined : undefined))
  const needsVault = vaultState === "none"
  const [worldIssue, setWorldIssue] = useState<WorldIdError | null>(null)
  const world = useWorldProof()
  const humanCheck = useWorldGate()

  const create = async (protection?: Protection) => {
    if (!deployment) throw new Error("Still connecting to the network. Try again in a moment.")
    setWorldIssue(null)
    if (protection) await webVault.create(protection)
    let created: Address | null
    try {
      created = await actions.create(world.prove)
    } catch (e) {
      if (!(e instanceof WorldIdError)) throw e
      // No account was made. A vault created in this attempt only holds a key nobody has seen, so remove it and
      // start over: recovery, a backup file, or another try are all offered again.
      if (protection) await webVault.destroy()
      setWorldIssue(e)
      return
    }
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

  if (account) {
    return <WalletDashboard w={w} onLock={() => void webVault.lock()} settings={settings} initialSend={payRequest} />
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background bg-lattice p-6 text-foreground">
      <Wordmark className="text-2xl [&_svg]:size-9" />
      <div className="flex w-full max-w-md flex-col gap-4">
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
        {worldIssue && <WorldIssue issue={worldIssue} />}
        <OnboardCard
          stage={stage}
          disabled={!deployment}
          needsVault={needsVault}
          onCreate={create}
          onRestore={() => setRestoreOpen(true)}
          onRecover={passkeysAllowedHere() ? recover : undefined}
          humanCheck={humanCheck ?? false}
        />
        {world.element}
        <RestoreDialog open={restoreOpen} onOpenChange={setRestoreOpen} needsVault={needsVault} onRestore={restore} />
      </div>
    </div>
  )
}

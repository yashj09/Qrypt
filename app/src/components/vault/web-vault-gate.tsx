import { useEffect, useState, type ReactNode } from "react"
import { ShieldCheckIcon } from "lucide-react"
import { LogoMark } from "@/components/brand/logo"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { localStorageKeyStore } from "@/lib/keystore"
import { webVault } from "@/lib/vault/web"
import { ProtectionChoice, type Protection } from "./protection-choice"
import { UnlockScreen } from "./unlock-screen"
import { useKeepAlive, useVaultState } from "./use-vault"

/**
 * The website's lock. A locked vault shows the unlock screen; a key left in plain localStorage by an older version
 * is moved into the vault first. With no vault yet, the page itself onboards (it creates the vault).
 */
export function WebVaultGate({ children }: { children: ReactNode }) {
  const state = useVaultState(webVault)
  const [legacy, setLegacy] = useState<boolean | null>(null)
  useKeepAlive(webVault, state === "unlocked")

  useEffect(() => {
    localStorageKeyStore.seed().then((s) => setLegacy(!!s))
  }, [state])

  if (state === null || legacy === null) return <Skeleton className="m-6 h-40" />
  if (state === "none" && legacy) return <ProtectExistingKey onDone={() => setLegacy(false)} />
  if (state === "locked") return <UnlockScreen vault={webVault} />
  return <>{children}</>
}

function ProtectExistingKey({ onDone }: { onDone: () => void }) {
  const protect = async (p: Protection) => {
    const seed = (await localStorageKeyStore.seed())!
    const pending = await localStorageKeyStore.pending.get()
    await webVault.create(p)
    await webVault.keyStore.save(seed)
    if (pending) await webVault.keyStore.pending.set(pending)
    await localStorageKeyStore.clear()
    onDone()
  }
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <LogoMark className="size-12" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4" />
            Protect your key
          </CardTitle>
          <CardDescription>
            Your Falcon key is stored unencrypted in this browser. Lock it with Face ID or a password; your account and
            balances don't change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProtectionChoice action="Protect" onChosen={protect} />
        </CardContent>
      </Card>
    </div>
  )
}

import { useEffect, useState, type ReactNode } from "react"
import { FingerprintIcon, LockKeyholeIcon, SparklesIcon } from "lucide-react"
import { LogoMark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { openOnboarding } from "../mount"
import { unlockWithTouchId } from "../touch-id"
import { onVaultChange, touch, touchIdWrap, unlockWithPassword, vaultState, type VaultState } from "../vault"

export function useVaultState(): VaultState | null {
  const [state, setState] = useState<VaultState | null>(null)
  useEffect(() => {
    const check = () => vaultState().then(setState)
    check()
    const id = setInterval(check, 30_000)
    const off = onVaultChange(check)
    return () => {
      clearInterval(id)
      off()
    }
  }, [])
  return state
}

/** Activity keeps an unlocked vault from auto-locking. */
function useKeepAlive(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let last = 0
    const onActivity = () => {
      if (Date.now() - last < 30_000) return
      last = Date.now()
      void touch()
    }
    window.addEventListener("pointerdown", onActivity)
    window.addEventListener("keydown", onActivity)
    return () => {
      window.removeEventListener("pointerdown", onActivity)
      window.removeEventListener("keydown", onActivity)
    }
  }, [enabled])
}

/** Shows `children` only when the wallet exists and is unlocked; otherwise setup or the lock screen. */
export function VaultGate({ children, extraUnlock }: { children: ReactNode; extraUnlock?: ReactNode }) {
  const state = useVaultState()
  useKeepAlive(state === "unlocked")
  if (state === null) return <Skeleton className="m-6 h-40" />
  if (state === "none") return <SetupPrompt />
  if (state === "locked") return <UnlockScreen extra={extraUnlock} />
  return <>{children}</>
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 p-6 text-center">{children}</div>
}

function SetupPrompt() {
  return (
    <Centered>
      <LogoMark className="size-12" />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Welcome to Eyrie</h1>
        <p className="text-sm text-muted-foreground">A post-quantum wallet. Set it up in a new tab.</p>
      </div>
      <Button onClick={openOnboarding}>
        <SparklesIcon data-icon="inline-start" />
        Set up Eyrie
      </Button>
    </Centered>
  )
}

export function UnlockScreen({ extra }: { extra?: ReactNode }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const unlock = async () => {
    setWorking(true)
    setError(null)
    try {
      await unlockWithPassword(password)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWorking(false)
    }
  }
  return (
    <Centered>
      <LogoMark className="size-12" />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Unlock to use your Falcon key.</p>
      </div>
      <form
        className="flex w-full max-w-xs flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void unlock()
        }}
      >
        <FieldGroup>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="unlock-password" className="sr-only">
              Password
            </FieldLabel>
            <Input
              id="unlock-password"
              type="password"
              placeholder="Password"
              autoFocus
              value={password}
              aria-invalid={!!error || undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={!password || working}>
          {working ? <Spinner data-icon="inline-start" /> : <LockKeyholeIcon data-icon="inline-start" />}
          Unlock
        </Button>
        <TouchIdUnlock />
        {extra}
      </form>
    </Centered>
  )
}

function TouchIdUnlock() {
  const [available, setAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    touchIdWrap().then((w) => setAvailable(!!w))
  }, [])
  if (!available) return null
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setError(null)
          unlockWithTouchId().catch((e: Error) => setError(e.message))
        }}
      >
        <FingerprintIcon data-icon="inline-start" />
        Unlock with Touch ID
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  )
}

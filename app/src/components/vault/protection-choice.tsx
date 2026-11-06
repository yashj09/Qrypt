import { useEffect, useState } from "react"
import { FingerprintIcon, KeyRoundIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { createPasskey, passkeysAvailable } from "@/lib/passkey"
import type { PasskeyKey } from "@/lib/vault/core"

export type Protection = { passkey: PasskeyKey } | { password: string }

const MIN_PASSWORD = 10

/**
 * How this device will unlock the Falcon key: Face ID (a passkey with PRF) when the browser can, a password otherwise.
 * `action` is the verb on the buttons, e.g. "Create" or "Restore".
 */
export function ProtectionChoice({ action, onChosen, disabled = false }: { action: string; onChosen: (p: Protection) => Promise<void>; disabled?: boolean }) {
  const [canPasskey, setCanPasskey] = useState<boolean | null>(null)
  const [mode, setMode] = useState<"choose" | "password">("choose")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    passkeysAvailable().then((ok) => {
      setCanPasskey(ok)
      if (!ok) setMode("password")
    })
  }, [])

  const run = async (get: () => Promise<Protection | null>) => {
    setWorking(true)
    setError(null)
    try {
      const p = await get()
      if (p) await onChosen(p)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  const withFaceId = () =>
    run(async () => {
      const created = await createPasskey()
      if (created.ok) return { passkey: created.key }
      setMode("password")
      setError("This browser can't derive a key from Face ID. Use a password instead.")
      return null
    })

  if (mode === "password") {
    const tooShort = password.length > 0 && password.length < MIN_PASSWORD
    const mismatch = confirm.length > 0 && confirm !== password
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => ({ password }))
        }}
      >
        <FieldGroup>
          <Field data-invalid={tooShort || undefined}>
            <FieldLabel htmlFor="vault-password">Password</FieldLabel>
            <Input id="vault-password" type="password" value={password} aria-invalid={tooShort || undefined} onChange={(e) => setPassword(e.target.value)} />
            {tooShort ? (
              <FieldError>Use at least {MIN_PASSWORD} characters.</FieldError>
            ) : (
              <FieldDescription>Encrypts your Falcon key on this device. At least {MIN_PASSWORD} characters.</FieldDescription>
            )}
          </Field>
          <Field data-invalid={mismatch || undefined}>
            <FieldLabel htmlFor="vault-confirm">Confirm password</FieldLabel>
            <Input id="vault-confirm" type="password" value={confirm} aria-invalid={mismatch || undefined} onChange={(e) => setConfirm(e.target.value)} />
            {mismatch && <FieldError>The passwords don't match.</FieldError>}
          </Field>
        </FieldGroup>
        {error && <p className="text-sm text-muted-foreground">{error}</p>}
        <Button type="submit" size="lg" disabled={disabled || working || password.length < MIN_PASSWORD || password !== confirm}>
          {working ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon data-icon="inline-start" />}
          {action} with a password
        </Button>
        {canPasskey && (
          <Button type="button" variant="ghost" onClick={() => setMode("choose")}>
            Use Face ID instead
          </Button>
        )}
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Button size="lg" disabled={disabled || working || canPasskey === null} onClick={withFaceId}>
        {working ? <Spinner data-icon="inline-start" /> : <FingerprintIcon data-icon="inline-start" />}
        {action} with Face ID
      </Button>
      <Button variant="ghost" disabled={working} onClick={() => setMode("password")}>
        Use a password instead
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

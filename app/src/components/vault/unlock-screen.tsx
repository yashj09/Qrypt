import { useEffect, useState } from "react"
import { FingerprintIcon, LockKeyholeIcon } from "lucide-react"
import { LogoMark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { askPasskey } from "@/lib/passkey"
import type { VaultApi } from "@/lib/vault/core"

/** Face ID first when the vault has a passkey; the password form when it has one. */
export function UnlockScreen({ vault }: { vault: VaultApi }) {
  const [methods, setMethods] = useState<{ passkey?: string; password: boolean } | null>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    Promise.all([vault.passkey(), vault.hasPassword()]).then(([p, hasPassword]) => setMethods({ passkey: p?.credentialId, password: hasPassword }))
  }, [vault])

  const attempt = async (fn: () => Promise<void>) => {
    setWorking(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWorking(false)
    }
  }
  const faceId = () => attempt(async () => vault.unlockWithPasskey((await askPasskey(methods!.passkey)).kek))

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <LogoMark className="size-12" />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Unlock to use your Falcon key.</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        {methods?.passkey && (
          <Button size="lg" disabled={working} onClick={faceId}>
            {working ? <Spinner data-icon="inline-start" /> : <FingerprintIcon data-icon="inline-start" />}
            Unlock with Face ID
          </Button>
        )}
        {methods?.password && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void attempt(() => vault.unlockWithPassword(password))
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
                  value={password}
                  aria-invalid={!!error || undefined}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </FieldGroup>
            <Button type="submit" variant={methods.passkey ? "outline" : "default"} disabled={!password || working}>
              <LockKeyholeIcon data-icon="inline-start" />
              Unlock with password
            </Button>
          </form>
        )}
        {error && <FieldError>{error}</FieldError>}
      </div>
    </div>
  )
}

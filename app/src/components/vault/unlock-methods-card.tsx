import { useEffect, useState } from "react"
import { FingerprintIcon, KeyRoundIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { createPasskey, passkeysAvailable } from "@/lib/passkey"
import type { VaultApi } from "@/lib/vault/core"

interface Methods {
  passkey: boolean
  password: boolean
  canPasskey: boolean
}

/** Face ID and password for one vault. At least one always stays on. */
export function UnlockMethodsCard({ vault }: { vault: VaultApi }) {
  const [m, setM] = useState<Methods | null>(null)
  const [editing, setEditing] = useState(false)
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const load = async () => setM({ passkey: !!(await vault.passkey()), password: await vault.hasPassword(), canPasskey: await passkeysAvailable() })
    void load()
    return vault.onChange(() => void load())
  }, [vault])

  const run = async (fn: () => Promise<string>) => {
    setWorking(true)
    setMessage(null)
    try {
      setMessage({ ok: true, text: await fn() })
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message })
    } finally {
      setWorking(false)
    }
  }

  const addFaceId = () =>
    run(async () => {
      const created = await createPasskey()
      if (!created.ok) throw new Error("This browser made the passkey but can't derive a key from it (no WebAuthn PRF).")
      await vault.addPasskey(created.key)
      return "Face ID can now unlock Qrypt on this device."
    })

  const savePassword = () =>
    run(async () => {
      await vault.setPassword(next, m?.password ? current : undefined)
      setEditing(false)
      setCurrent("")
      setNext("")
      return m?.password ? "Password changed." : "Password set. It works alongside Face ID."
    })

  if (!m) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Unlock methods</CardTitle>
        <CardDescription>How this device decrypts your Falcon key. The key itself doesn't change.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ItemGroup className="gap-2">
          <Item variant="outline" size="sm">
            <ItemMedia variant="icon">
              <FingerprintIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Face ID / Touch ID</ItemTitle>
              <ItemDescription>
                {m.passkey ? "On." : m.canPasskey ? "Off." : "Not available in this browser or on this domain."}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              {m.passkey ? (
                <Button variant="outline" size="sm" disabled={working || !m.password} onClick={() => run(async () => (await vault.removePasskey(), "Face ID unlock removed."))}>
                  Remove
                </Button>
              ) : (
                <Button size="sm" disabled={working || !m.canPasskey} onClick={addFaceId}>
                  Turn on
                </Button>
              )}
            </ItemActions>
          </Item>
          <Item variant="outline" size="sm">
            <ItemMedia variant="icon">
              <KeyRoundIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Password</ItemTitle>
              <ItemDescription>{m.password ? "On." : "Off. Add one as a fallback for browsers without Face ID."}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="outline" size="sm" disabled={working} onClick={() => setEditing((e) => !e)}>
                {m.password ? "Change" : "Add"}
              </Button>
            </ItemActions>
          </Item>
        </ItemGroup>
        {editing && (
          <FieldGroup>
            {m.password && (
              <Field>
                <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                <Input id="current-password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="next-password">New password (10+ characters)</FieldLabel>
              <Input id="next-password" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
          </FieldGroup>
        )}
        {message &&
          (message.ok ? <p className="text-sm text-muted-foreground">{message.text}</p> : <FieldError>{message.text}</FieldError>)}
      </CardContent>
      {editing && (
        <CardFooter className="justify-end">
          <Button disabled={working || next.length < 10 || (m.password && !current)} onClick={savePassword}>
            {working && <Spinner data-icon="inline-start" />}
            Save password
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

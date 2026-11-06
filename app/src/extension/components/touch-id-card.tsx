import { useEffect, useState } from "react"
import { FingerprintIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { enableTouchId, platformAuthenticatorAvailable } from "../touch-id"
import { onVaultChange, removeTouchIdWrap, touchIdWrap } from "../vault"

type Status = "loading" | "unavailable" | "off" | "on"

export function TouchIdCard() {
  const [status, setStatus] = useState<Status>("loading")
  const [message, setMessage] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    const check = async () => {
      if (await touchIdWrap()) return setStatus("on")
      setStatus((await platformAuthenticatorAvailable()) ? "off" : "unavailable")
    }
    void check()
    return onVaultChange(() => void check())
  }, [])

  const enable = async () => {
    setWorking(true)
    setMessage(null)
    try {
      const result = await enableTouchId()
      setMessage(
        result === "enabled"
          ? "Touch ID can now unlock Qrypt. Your password still works too."
          : "This browser made a Touch ID passkey but can't derive a key from it (it needs WebAuthn PRF, e.g. an iCloud Keychain passkey in Chrome). Password unlock stays on.",
      )
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FingerprintIcon className="size-4" />
          Touch ID
        </CardTitle>
        <CardDescription>
          {status === "on"
            ? "On. Touch ID unwraps your key through WebAuthn PRF; the password is the fallback."
            : status === "unavailable"
              ? "This browser has no platform authenticator, so Touch ID isn't available."
              : "Unlock with your fingerprint. It only turns on if this browser can derive a real key from Touch ID."}
        </CardDescription>
      </CardHeader>
      {message && (
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      )}
      <CardFooter>
        {status === "on" ? (
          <Button variant="outline" onClick={() => void removeTouchIdWrap()}>
            Turn off Touch ID
          </Button>
        ) : (
          <Button disabled={status !== "off" || working} onClick={enable}>
            {working ? <Spinner data-icon="inline-start" /> : <FingerprintIcon data-icon="inline-start" />}
            Set up Touch ID
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

import { useEffect, useState } from "react"
import type { Address } from "viem"
import { InstallGuide } from "@/components/mobile/install-guide"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import {
  disablePush,
  enablePush,
  pushAvailability,
  type PushAvailability,
} from "@/lib/push"

/** Payment notifications, delivered by the push watcher that runs next to our sidecar. */
export function NotificationsCard({ account }: { account: Address }) {
  const [state, setState] = useState<PushAvailability | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    void pushAvailability().then(setState)
  }, [])

  const toggle = async (on: boolean) => {
    setWorking(true)
    setError(null)
    try {
      if (on) await enablePush(account)
      else await disablePush()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setState(await pushAvailability())
      setWorking(false)
    }
  }

  if (!state) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Hear about incoming payments even when Qrypt is closed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === "ready" ? (
          <Field orientation="horizontal" data-invalid={!!error || undefined}>
            <FieldContent>
              <FieldLabel htmlFor="push-toggle">Payment received</FieldLabel>
              <FieldDescription>
                USDC, tokens and ETH sent to this account.
              </FieldDescription>
              {error && <FieldError>{error}</FieldError>}
            </FieldContent>
            <Switch
              id="push-toggle"
              checked={state.subscribed}
              disabled={working}
              onCheckedChange={(on) => void toggle(on)}
            />
          </Field>
        ) : state.kind === "needs-install" ? (
          <Field>
            <FieldDescription>
              On iPhone, notifications only work once Qrypt is on your Home
              Screen.
            </FieldDescription>
            <Button variant="outline" onClick={() => setGuideOpen(true)}>
              Show me how
            </Button>
            <InstallGuide open={guideOpen} onOpenChange={setGuideOpen} />
          </Field>
        ) : (
          <FieldDescription>
            {state.kind === "blocked"
              ? "Notifications are blocked for this site. Allow them in your browser's site settings, then come back."
              : "This browser can't receive push notifications."}
          </FieldDescription>
        )}
      </CardContent>
    </Card>
  )
}

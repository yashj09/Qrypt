import { hashMessage, type Address } from "viem"
import { bytesToHex, hexToBytes } from "@qpay/frametx"
import { isIos, isStandalone } from "@/hooks/use-media-query"
import { keyStore } from "@/lib/keystore"
import { pushMessage, type PushRecord } from "@/lib/push-format"
import { signerFromSeed } from "@/lib/qpay"
import { API_BASE, VAPID_PUBLIC_KEY } from "@/lib/site"

/** Payment notifications: the browser's push subscription, registered with /api/push under the account's signature. */

export type PushAvailability =
  | { kind: "ready"; subscribed: boolean }
  | { kind: "needs-install" } // iPhone Safari: push only works in the home-screen app
  | { kind: "blocked" } // the user said no; only browser settings can undo it
  | { kind: "unsupported" }

const supported = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window

export async function pushAvailability(): Promise<PushAvailability> {
  if (isIos() && !isStandalone()) return { kind: "needs-install" }
  if (!supported()) return { kind: "unsupported" }
  if (Notification.permission === "denied") return { kind: "blocked" }
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  return {
    kind: "ready",
    subscribed: !!subscription && Notification.permission === "granted",
  }
}

const fromBase64Url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0)
  )

/** Must run from a tap: iOS only shows the permission prompt in response to one. */
export async function enablePush(account: Address): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== "granted")
    throw new Error("Notifications weren't allowed.")
  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: fromBase64Url(VAPID_PUBLIC_KEY),
    }))
  const { endpoint, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth)
    throw new Error("The browser returned an incomplete push subscription.")

  const seed = await keyStore().seed()
  if (!seed) throw new Error("Unlock Qrypt first.")
  const record: PushRecord = {
    v: 1,
    account,
    subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
  }
  const ts = Date.now()
  const signature = bytesToHex(
    await signerFromSeed(seed).sign(
      hexToBytes(hashMessage(pushMessage(record, ts)))
    )
  )
  const res = await fetch(`${API_BASE}/api/push`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ record, ts, signature }),
  })
  if (!res.ok) {
    await subscription.unsubscribe()
    throw new Error(
      ((await res.json().catch(() => ({}))) as { error?: string }).error ??
        `couldn't register (${res.status})`
    )
  }
  await registration.showNotification("Payment notifications are on", {
    body: "You'll hear from Qrypt when money arrives.",
    icon: "/icons/icon-192.png",
    tag: "qrypt-push-on",
  })
}

/** The push service then answers 410 to the watcher, which deletes our record. */
export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration()
  await (await registration?.pushManager.getSubscription())?.unsubscribe()
}

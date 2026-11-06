import { put } from "@vercel/blob"
import { isAddress } from "viem"
import { isPushEndpoint, pushMessage, pushPath, type PushRecord } from "../src/lib/push-format.js"
import { accountSigned, freshTimestamp, json } from "./_account-auth.js"

/**
 * Payment-notification subscriptions, read by the push watcher next to our sidecar.
 *
 * POST { record, ts, signature } -> stores the browser's push subscription for the account, if `signature` is the
 *                                   account's current Falcon key signing pushMessage(record, ts) (ERC-1271).
 *
 * Turning notifications off just unsubscribes in the browser: the push service then answers 410 and the watcher
 * deletes the record.
 */
export async function POST(request: Request): Promise<Response> {
  let body: { record?: PushRecord; ts?: unknown; signature?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: "expected a JSON body" }, 400)
  }
  const { record, ts, signature } = body
  const keys = record?.subscription?.keys
  if (
    !record ||
    record.v !== 1 ||
    !isAddress(record.account) ||
    !isPushEndpoint(record.subscription?.endpoint) ||
    typeof keys?.p256dh !== "string" ||
    typeof keys.auth !== "string" ||
    keys.p256dh.length > 200 ||
    keys.auth.length > 100
  ) {
    return json({ error: "malformed subscription" }, 400)
  }
  if (!freshTimestamp(ts)) return json({ error: "stale or missing timestamp" }, 400)
  if (!(await accountSigned(record.account, pushMessage(record, ts), signature))) {
    return json({ error: "the account's Falcon key didn't sign this" }, 401)
  }
  // Store exactly the fields we validated, nothing else from the request.
  const stored: PushRecord = {
    v: 1,
    account: record.account,
    subscription: { endpoint: record.subscription.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
  }
  await put(pushPath(stored.account, stored.subscription.endpoint), JSON.stringify(stored), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  })
  return json({ ok: true })
}

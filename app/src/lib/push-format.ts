import { sha256, toBytes, type Address, type Hex } from "viem"

/** Shared by the browser, /api/push and the push watcher: what is stored, where, and what the Falcon key signs. */
export interface PushRecord {
  v: 1
  account: Address
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
}

/**
 * The push services browsers actually use. The watcher POSTs to whatever endpoint is stored, so anything else is
 * refused rather than letting a stored record point it at an arbitrary URL.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^jmt\d+\.google\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/]

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1024) return false
  try {
    const url = new URL(endpoint)
    return url.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(url.hostname))
  } catch {
    return false
  }
}

const endpointId = (endpoint: string): Hex => sha256(toBytes(endpoint))

export const PUSH_PREFIX = "push/"
export const pushPath = (account: Address, endpoint: string) => `${PUSH_PREFIX}${account.toLowerCase()}/${endpointId(endpoint)}.json`

export const pushMessage = (record: PushRecord, ts: number) =>
  `Qrypt push v1\n${record.account.toLowerCase()}\n${sha256(toBytes(JSON.stringify(record)))}\n${ts}`

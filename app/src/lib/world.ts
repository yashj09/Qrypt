import type { IDKitResult, RpContext } from "@worldcoin/idkit"
import type { Hex } from "viem"
import { API_BASE } from "@/lib/site"

/** World ID for sponsored onboarding, client side. The server decides whether it's required (api/world.ts). */
export interface WorldRequest {
  app_id: `app_${string}`
  action: string
  environment: "production" | "staging"
  rp_context: RpContext
}

/** A freshly signed request, or null when onboarding isn't gated (e.g. local development). */
export async function worldRequest(): Promise<WorldRequest | null> {
  const res = await fetch(`${API_BASE}/api/world`)
  if (!res.ok) throw new Error(`Couldn't start World ID (${res.status}).`)
  const body = (await res.json()) as ({ enabled: false } | ({ enabled: true } & WorldRequest))
  return body.enabled ? body : null
}

/** Opens World ID for this request and resolves with the proof; rejects with a WorldIdError. */
export type ProveHuman = (request: WorldRequest, signal: Hex) => Promise<IDKitResult>

export class WorldIdError extends Error {
  readonly code: string
  constructor(code: string) {
    super(worldIdMessage(code))
    this.code = code
  }
}

/** What each outcome means for the person in front of the screen, and what they can do instead. */
export function worldIdMessage(code: string): string {
  switch (code) {
    case "user_rejected":
    case "cancelled":
      return "World ID verification was cancelled. A sponsored account needs it; you can try again, recover an existing account with Face ID, or import a backup file."
    case "credential_unavailable":
    case "world_wrong_credential":
    case "world_id_4_not_available":
      return "This needs an Orb-verified World ID (Proof of Human). You can still recover an existing account or import a backup file."
    case "max_verifications_reached":
    case "world_already_used":
      return "This World ID already created a Qrypt account. Recover it with Face ID or a backup file instead."
    case "verification_rejected":
      return "World App declined the verification. Try again."
    case "connection_failed":
    case "rp_signature_expired":
    case "timestamp_too_old":
    case "world_unreachable":
      return "The World ID connection timed out. Try again."
    case "world_signal_mismatch":
      return "That World ID proof was made for a different key. Try again."
    default:
      return `World ID couldn't verify you (${code}). Try again.`
  }
}

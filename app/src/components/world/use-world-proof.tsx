import { useCallback, useEffect, useRef, useState } from "react"
import { IDKitRequestWidget, proofOfHuman, type IDKitResult } from "@worldcoin/idkit"
import type { Hex } from "viem"
import { WorldIdError, worldRequest, type ProveHuman, type WorldRequest } from "@/lib/world"

/**
 * World ID as a promise: `prove(request, signal)` opens IDKit (a QR code for World App on desktop, a deep link on a
 * phone) and resolves with the proof, or rejects with a WorldIdError when the person cancels or can't verify.
 * Render `element` once on the page that onboards.
 */
export function useWorldProof(): { prove: ProveHuman; element: React.ReactNode } {
  const [pending, setPending] = useState<{ request: WorldRequest; signal: Hex } | null>(null)
  const [open, setOpen] = useState(false)
  const settle = useRef<{ resolve: (r: IDKitResult) => void; reject: (e: Error) => void } | null>(null)

  const prove = useCallback<ProveHuman>(
    (request, signal) =>
      new Promise<IDKitResult>((resolve, reject) => {
        settle.current = { resolve, reject }
        setPending({ request, signal })
        setOpen(true)
      }),
    [],
  )

  const finish = (fn: (s: NonNullable<typeof settle.current>) => void) => {
    const s = settle.current
    settle.current = null
    setOpen(false)
    if (s) fn(s)
  }

  const element = pending && (
    <IDKitRequestWidget
      // A fresh widget per request, so a retry never reuses a spent RP signature.
      key={pending.request.rp_context.nonce}
      open={open}
      onOpenChange={(next) => {
        // Closing the dialog before a proof arrives is a cancellation.
        if (!next) finish((s) => s.reject(new WorldIdError("cancelled")))
        else setOpen(true)
      }}
      app_id={pending.request.app_id}
      action={pending.request.action}
      rp_context={pending.request.rp_context}
      environment={pending.request.environment}
      // World ID 4.0 only: accepting legacy proofs too would let one person claim with both a v3 and a v4 nullifier.
      allow_legacy_proofs={false}
      preset={proofOfHuman({ signal: pending.signal })}
      onSuccess={(result) => finish((s) => s.resolve(result))}
      onError={(code) => finish((s) => s.reject(new WorldIdError(code)))}
    />
  )
  return { prove, element }
}

/** Whether the server gates new accounts on World ID (null while checking). */
export function useWorldGate(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  useEffect(() => {
    worldRequest().then(
      (r) => setEnabled(r !== null),
      () => setEnabled(null),
    )
  }, [])
  return enabled
}

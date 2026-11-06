import { useEffect, useState } from "react"
import type { Address } from "viem"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { askPasskey } from "@/lib/passkey"
import { RECOVERY_SAVED, hasRecovery, uploadRecovery } from "@/lib/recovery"
import { webVault } from "@/lib/vault/web"

/** Whether Face ID can recover this account on another device, with a way to (re)save it. */
export function RecoveryStatus({ account }: { account: Address }) {
  const [state, setState] = useState<"none" | "saved" | "missing" | "working">("none")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const check = async () => {
      const p = await webVault.passkey()
      if (!p) return setState("none")
      setState((await hasRecovery(p.credentialId).catch(() => false)) ? "saved" : "missing")
    }
    void check()
    const onSaved = () => void check()
    window.addEventListener(RECOVERY_SAVED, onSaved)
    const off = webVault.onChange(onSaved)
    return () => {
      off()
      window.removeEventListener(RECOVERY_SAVED, onSaved)
    }
  }, [account])

  const save = async () => {
    setState("working")
    setError(null)
    try {
      const p = (await webVault.passkey())!
      await uploadRecovery(account, await askPasskey(p.credentialId), (await webVault.keyStore.seed())!)
      setState("saved")
    } catch (e) {
      setError((e as Error).message)
      setState("missing")
    }
  }

  if (state === "none") return null
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3 text-sm">
      <span className={state === "saved" ? "text-foreground" : "text-muted-foreground"}>
        {state === "saved"
          ? "Recoverable with Face ID on your other devices."
          : error ?? "Face ID recovery isn't saved yet."}
      </span>
      {state !== "saved" && (
        <Button size="sm" variant="outline" disabled={state === "working"} onClick={save}>
          {state === "working" && <Spinner data-icon="inline-start" />}
          Save
        </Button>
      )}
    </div>
  )
}

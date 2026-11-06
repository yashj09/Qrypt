import { useEffect, useState } from "react"
import type { VaultApi, VaultState } from "@/lib/vault/core"

export function useVaultState(vault: VaultApi): VaultState | null {
  const [state, setState] = useState<VaultState | null>(null)
  useEffect(() => {
    const check = () => vault.state().then(setState)
    check()
    const id = setInterval(check, 30_000)
    const off = vault.onChange(check)
    return () => {
      clearInterval(id)
      off()
    }
  }, [vault])
  return state
}

/** Activity keeps an unlocked vault from auto-locking. */
export function useKeepAlive(vault: VaultApi, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let last = 0
    const onActivity = () => {
      if (Date.now() - last < 30_000) return
      last = Date.now()
      void vault.touch()
    }
    window.addEventListener("pointerdown", onActivity)
    window.addEventListener("keydown", onActivity)
    return () => {
      window.removeEventListener("pointerdown", onActivity)
      window.removeEventListener("keydown", onActivity)
    }
  }, [vault, enabled])
}

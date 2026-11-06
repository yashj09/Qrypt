import { WebVaultGate } from "@/components/vault/web-vault-gate"
import { useDarkWallet } from "@/lib/pwa"
import ConnectPage from "@/routes/connect"

/** The website's approval popup: unlock first, then the shared approval screen. */
export default function WebConnect() {
  useDarkWallet()
  return (
    <WebVaultGate>
      <ConnectPage />
    </WebVaultGate>
  )
}

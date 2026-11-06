import { WebVaultGate } from "@/components/vault/web-vault-gate"
import ConnectPage from "@/routes/connect"

/** The website's approval popup: unlock first, then the shared approval screen. */
export default function WebConnect() {
  return (
    <WebVaultGate>
      <ConnectPage />
    </WebVaultGate>
  )
}

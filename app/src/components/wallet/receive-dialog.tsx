import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import QRCode from "qrcode"
import type { Address } from "viem"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { assetSymbol, type Asset } from "@/lib/assets"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: Address
  chainId: number
  assets: Asset[]
}

export function ReceiveDialog({ open, onOpenChange, account, chainId, assets }: Props) {
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    QRCode.toDataURL(`ethereum:${account}@${chainId}`, { margin: 1, width: 480, color: { dark: "#1c1b18", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null))
  }, [open, account, chainId])

  const copy = () =>
    navigator.clipboard.writeText(account).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive</DialogTitle>
          <DialogDescription>
            Send {assets.map(assetSymbol).join(", ")} to this address on the EIP-8141 devnet (chain {chainId}).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {qr && <img src={qr} alt="QR code for your address" className="size-56 rounded-lg border" />}
          <p className="text-center font-mono text-sm break-all">{account}</p>
          <Button variant="outline" onClick={copy}>
            {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            {copied ? "Copied" : "Copy address"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            The account is a smart contract. Only send from this devnet; other chains can't reach it.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

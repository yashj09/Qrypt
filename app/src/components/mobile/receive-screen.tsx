import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react"
import QRCode from "qrcode"
import type { Address } from "viem"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { assetKey, assetSymbol, type Asset } from "@/lib/assets"
import { payLink } from "@/lib/payment-request"
import { short } from "@/lib/format"

/** A QR code and link that asks to be paid: anyone scanning it with the iPhone camera lands in Qrypt's pay screen. */
export function ReceiveScreen({ account, assets }: { account: Address; assets: Asset[] }) {
  const [assetId, setAssetId] = useState(assetKey(assets[0]))
  const [amount, setAmount] = useState("")
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState<"link" | "address" | null>(null)
  const asset = assets.find((a) => assetKey(a) === assetId) ?? assets[0]
  const validAmount = amount === "" || /^\d+(\.\d+)?$/.test(amount)
  const link = payLink(window.location.origin, { to: account, amount: validAmount && amount ? amount : undefined, asset: assetSymbol(asset) })

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 520, color: { dark: "#0c0d0f", light: "#ffffff" } }).then(setQr, () => setQr(null))
  }, [link])

  const copy = (what: "link" | "address") =>
    navigator.clipboard.writeText(what === "link" ? link : account).then(() => {
      setCopied(what)
      setTimeout(() => setCopied(null), 1200)
    })
  const share = () => navigator.share?.({ title: "Pay me with Qrypt", text: amount ? `${amount} ${assetSymbol(asset)}` : "Pay me with Qrypt", url: link })

  return (
    <div className="flex flex-col items-center gap-5">
      {qr && <img src={qr} alt="Payment request QR code" className="size-64 rounded-2xl bg-white p-2" />}
      <button type="button" className="font-mono text-sm text-muted-foreground" onClick={() => void copy("address")}>
        {copied === "address" ? "Address copied" : short(account, 8)}
      </button>
      <ToggleGroup value={[assetId]} onValueChange={(v) => v[0] && setAssetId(String(v[0]))} variant="outline">
        {assets.map((a) => (
          <ToggleGroupItem key={assetKey(a)} value={assetKey(a)}>
            {assetSymbol(a)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Field data-invalid={!validAmount || undefined} className="w-full">
        <FieldLabel htmlFor="request-amount">Request an amount (optional)</FieldLabel>
        <InputGroup>
          <InputGroupInput id="request-amount" inputMode="decimal" placeholder="0.00" value={amount} aria-invalid={!validAmount || undefined} onChange={(e) => setAmount(e.target.value.trim())} />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{assetSymbol(asset)}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>Whoever scans this pays you in one Face ID tap, and needs no ETH either.</FieldDescription>
      </Field>
      <div className="grid w-full grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => void copy("link")}>
          {copied === "link" ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
          Copy link
        </Button>
        <Button disabled={!("share" in navigator)} onClick={() => void share()}>
          <Share2Icon data-icon="inline-start" />
          Share
        </Button>
      </div>
    </div>
  )
}

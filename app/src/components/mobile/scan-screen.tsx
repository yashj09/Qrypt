import { useEffect, useRef, useState } from "react"
import { ImageIcon } from "lucide-react"
import QrScanner from "qr-scanner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { parsePaymentRequest, type PaymentRequest } from "@/lib/payment-request"

/** The camera, looking for a Qrypt pay link, an ethereum: URI, or an address. Also reads a QR from a photo. */
export function ScanScreen({ onResult }: { onResult: (req: PaymentRequest) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const photo = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const handle = (text: string) => {
    const req = parsePaymentRequest(text)
    if (req) onResult(req)
    else setError("That QR code isn't a payment request or an address.")
  }

  useEffect(() => {
    if (!video.current) return
    const scanner = new QrScanner(video.current, (r) => handle(r.data), { preferredCamera: "environment", highlightScanRegion: true, returnDetailedScanResult: true })
    scanner.start().catch(() => setError("Camera unavailable. Allow camera access, or pick a photo of the QR code."))
    return () => scanner.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fromPhoto = async (file: File) => {
    setError(null)
    try {
      handle((await QrScanner.scanImage(file, { returnDetailedScanResult: true })).data)
    } catch {
      setError("No QR code found in that photo.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl bg-muted">
        <video ref={video} className="aspect-square w-full object-cover" muted playsInline />
      </div>
      {error && (
        <Alert>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Input ref={photo} id="scan-photo" type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void fromPhoto(e.target.files[0])} />
      <Button variant="outline" onClick={() => photo.current?.click()}>
        <ImageIcon data-icon="inline-start" />
        Scan from a photo
      </Button>
    </div>
  )
}

import { useState } from "react"
import { PlusIcon } from "lucide-react"
import type { Address } from "viem"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { readToken, type Asset } from "@/lib/assets"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (asset: Asset) => void
}

export function AddTokenDialog({ open, onOpenChange, onAdd }: Props) {
  const [address, setAddress] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = /^0x[0-9a-fA-F]{40}$/.test(address)

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      onAdd(await readToken(address as Address))
      setAddress("")
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a token</DialogTitle>
          <DialogDescription>Any ERC-20 on this devnet. Fees are still paid in USDC.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="token-address">Token contract address</FieldLabel>
            <Input
              id="token-address"
              className="font-mono"
              placeholder="0x…"
              value={address}
              aria-invalid={!!error || undefined}
              onChange={(e) => setAddress(e.target.value.trim())}
            />
            {error ? <FieldError>{error}</FieldError> : <FieldDescription>We read its symbol and decimals from the chain.</FieldDescription>}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={!valid || busy} onClick={add}>
            {busy ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
            Add token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

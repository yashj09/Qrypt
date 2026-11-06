import { useState } from "react"
import { UploadIcon } from "lucide-react"
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
import { ProtectionChoice, type Protection } from "@/components/vault/protection-choice"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** This device has no vault yet, so restoring also asks how to protect the key (Face ID or a password). */
  needsVault: boolean
  onRestore: (file: File, password: string, protection?: Protection) => Promise<void>
}

export function RestoreDialog({ open, onOpenChange, needsVault, onRestore }: Props) {
  const [protecting, setProtecting] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState("")
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const restore = async (protection?: Protection) => {
    if (!file) return
    setWorking(true)
    setError(null)
    try {
      await onRestore(file, password, protection)
      setProtecting(false)
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore from backup</DialogTitle>
          <DialogDescription>We decrypt the key in this browser and check onchain that it still controls the account.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="restore-file">Backup file</FieldLabel>
            <Input id="restore-file" type="file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="restore-password">Password</FieldLabel>
            <Input id="restore-password" type="password" value={password} aria-invalid={!!error || undefined} onChange={(e) => setPassword(e.target.value)} />
            {error ? <FieldError>{error}</FieldError> : <FieldDescription>The one you chose when you made the backup.</FieldDescription>}
          </Field>
        </FieldGroup>
        {protecting && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">How should this device unlock the restored key?</p>
            <ProtectionChoice action="Restore" onChosen={(p) => restore(p)} />
          </div>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={!file || !password || working} onClick={() => (needsVault ? setProtecting(true) : void restore())}>
            {working ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
            {needsVault ? "Continue" : "Restore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

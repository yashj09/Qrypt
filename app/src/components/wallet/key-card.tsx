import { useState } from "react"
import { DownloadIcon, KeyRoundIcon, LogOutIcon, RefreshCwIcon } from "lucide-react"
import type { Address } from "viem"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"

type Open = "backup" | "rotate" | "close" | null

interface Props {
  busy: boolean
  onBackup: (password: string) => Promise<void>
  onRotate: () => Promise<void>
  onClose: (to: Address) => Promise<void>
  onForget: () => void
}

const MIN_PASSWORD = 10

export function KeyCard({ busy, onBackup, onRotate, onClose, onForget }: Props) {
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          Key and account
        </CardTitle>
        <CardDescription>Your Falcon key lives on this device, encrypted. A backup file restores it anywhere, without Face ID or our server.</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup>
          <Action
            icon={<DownloadIcon />}
            title="Back up key"
            description="A password-encrypted file you can restore on any device."
            label="Back up"
            disabled={busy}
            onClick={() => setOpen("backup")}
          />
          <Action
            icon={<RefreshCwIcon />}
            title="Rotate key"
            description="Replace the Falcon key onchain, signed by the current one. Old backups stop working."
            label="Rotate"
            disabled={busy}
            onClick={() => setOpen("rotate")}
          />
          <Action
            icon={<LogOutIcon />}
            title="Close account"
            description="Unstake and sweep every balance to another address, in one transaction."
            label="Close"
            disabled={busy}
            onClick={() => setOpen("close")}
          />
        </ItemGroup>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" size="sm" onClick={onForget}>
          Forget this key on this device
        </Button>
      </CardFooter>
      <BackupDialog open={open === "backup"} onDone={close} onBackup={onBackup} />
      <AlertDialog open={open === "rotate"} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate your Falcon key?</AlertDialogTitle>
            <AlertDialogDescription>
              This browser makes a new key, and your current key signs a transaction that installs it. Once it's included,
              the old key and any backup of it stop working, so back up again right after.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                close()
                void onRotate()
              }}
            >
              Rotate key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CloseDialog open={open === "close"} onDone={close} onClose={onClose} />
    </Card>
  )
}

function Action(props: { icon: React.ReactNode; title: string; description: string; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Item size="sm" variant="outline">
      <ItemMedia variant="icon">{props.icon}</ItemMedia>
      <ItemContent>
        <ItemTitle>{props.title}</ItemTitle>
        <ItemDescription className="line-clamp-none">{props.description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm" disabled={props.disabled} onClick={props.onClick}>
          {props.label}
        </Button>
      </ItemActions>
    </Item>
  )
}

function BackupDialog({ open, onDone, onBackup }: { open: boolean; onDone: () => void; onBackup: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [working, setWorking] = useState(false)
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD
  const mismatch = confirm.length > 0 && confirm !== password
  const ready = password.length >= MIN_PASSWORD && confirm === password && !working

  const save = async () => {
    setWorking(true)
    try {
      await onBackup(password)
      setPassword("")
      setConfirm("")
      onDone()
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Back up your key</DialogTitle>
          <DialogDescription>
            The file is encrypted in this browser with your password (PBKDF2, 600,000 rounds, then AES-GCM). Without the
            password, the file is useless; without the file, so is the password.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-invalid={tooShort || undefined}>
            <FieldLabel htmlFor="backup-password">Password</FieldLabel>
            <Input id="backup-password" type="password" value={password} aria-invalid={tooShort || undefined} onChange={(e) => setPassword(e.target.value)} />
            {tooShort ? <FieldError>Use at least {MIN_PASSWORD} characters.</FieldError> : <FieldDescription>At least {MIN_PASSWORD} characters.</FieldDescription>}
          </Field>
          <Field data-invalid={mismatch || undefined}>
            <FieldLabel htmlFor="backup-confirm">Confirm password</FieldLabel>
            <Input id="backup-confirm" type="password" value={confirm} aria-invalid={mismatch || undefined} onChange={(e) => setConfirm(e.target.value)} />
            {mismatch && <FieldError>The passwords don't match.</FieldError>}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={!ready} onClick={save}>
            {working ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
            Download backup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CloseDialog({ open, onDone, onClose }: { open: boolean; onDone: () => void; onClose: (to: Address) => Promise<void> }) {
  const [to, setTo] = useState("")
  const valid = /^0x[0-9a-fA-F]{40}$/.test(to)
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onDone()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close this account?</AlertDialogTitle>
          <AlertDialogDescription>
            One transaction unlocks and withdraws the 0.02 ETH stake and sends every balance to the address below. The fee
            comes out of the USDC. Without stake, the account loses its larger validation budget, so treat it as closed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field data-invalid={(to.length > 0 && !valid) || undefined}>
            <FieldLabel htmlFor="close-to">Send everything to</FieldLabel>
            <Input id="close-to" className="font-mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} />
          </Field>
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!valid}
            onClick={() => {
              onDone()
              void onClose(to as Address)
            }}
          >
            Close account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

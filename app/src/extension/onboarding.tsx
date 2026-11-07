import { useEffect, useState, type ReactNode } from "react"
import { ArrowRightIcon, CheckIcon, FileUpIcon, KeyRoundIcon, PinIcon, SparklesIcon } from "lucide-react"
import { LogoMark } from "@/components/brand/logo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { openBackup } from "@/lib/keys"
import { createAccount, loadDeployment, storeAccount, type Deployment, type OnboardStage } from "@/lib/qpay"
import { short } from "@/lib/format"
import { mount, openFullscreen } from "./mount"
import { createVault, vaultKeyStore, vaultState } from "./vault"

const MIN_PASSWORD = 10

type Step =
  | { kind: "welcome" }
  | { kind: "create" }
  | { kind: "creating"; stage: OnboardStage | null }
  | { kind: "import" }
  | { kind: "done"; account: string; imported: boolean }
  | { kind: "existing" }

const STAGES: { key: OnboardStage; title: string }[] = [
  { key: "key", title: "Generating your Falcon key on this device" },
  { key: "register", title: "Registering the public key" },
  { key: "deploy", title: "Deploying and staking your account, adding 100 test USDC" },
]

function Onboarding() {
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [step, setStep] = useState<Step>({ kind: "welcome" })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDeployment().then(setDeployment, (e) => setError(String(e?.message ?? e)))
    vaultState().then((s) => s !== "none" && setStep({ kind: "existing" }))
  }, [])

  const create = async (password: string) => {
    if (!deployment) return
    setError(null)
    setStep({ kind: "creating", stage: null })
    try {
      await createVault(password)
      const account = await createAccount(deployment, (stage) => setStep({ kind: "creating", stage }))
      setStep({ kind: "done", account, imported: false })
    } catch (e) {
      await vaultKeyStore.clear()
      setError((e as Error).message)
      setStep({ kind: "create" })
    }
  }

  const importBackup = async (file: File, backupPassword: string, password: string) => {
    if (!deployment) return
    setError(null)
    const { account, seed } = await openBackup(deployment, file, backupPassword)
    await createVault(password)
    await vaultKeyStore.save(seed)
    storeAccount(deployment, account)
    setStep({ kind: "done", account, imported: true })
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background bg-lattice p-6 text-foreground">
      <div className="flex items-center gap-3">
        <LogoMark className="size-9" />
        <span className="text-2xl font-semibold tracking-tight">Qrypt</span>
      </div>
      <div className="w-full max-w-md">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription className="break-all">{error}</AlertDescription>
          </Alert>
        )}
        {step.kind === "welcome" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">The post-quantum wallet</CardTitle>
              <CardDescription>
                Your key is a Falcon-512 key that lives in this extension, encrypted with your password. Gas is paid in
                USDC, so you never need ETH.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Choice icon={<SparklesIcon />} title="Create a new wallet" body="About 15 seconds. We set up an account and add 100 test USDC." onClick={() => setStep({ kind: "create" })} />
              <Choice icon={<FileUpIcon />} title="Import a backup file" body="Bring an account from the Qrypt website or another browser." onClick={() => setStep({ kind: "import" })} />
            </CardContent>
          </Card>
        )}
        {step.kind === "create" && <PasswordCard disabled={!deployment} onSubmit={create} onBack={() => setStep({ kind: "welcome" })} />}
        {step.kind === "creating" && <CreatingCard stage={step.stage} />}
        {step.kind === "import" && <ImportCard disabled={!deployment} onImport={importBackup} onBack={() => setStep({ kind: "welcome" })} />}
        {step.kind === "done" && <DoneCard account={step.account} imported={step.imported} />}
        {step.kind === "existing" && (
          <Card>
            <CardHeader>
              <CardTitle>Qrypt is already set up</CardTitle>
              <CardDescription>This browser already has an Qrypt wallet. Open it from the toolbar, or here.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button className="w-full" onClick={() => openFullscreen()}>
                Open wallet
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  )
}

function Choice({ icon, title, body, onClick }: { icon: ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <Item variant="outline" render={<button type="button" onClick={onClick} className="text-left" />}>
      <ItemMedia variant="icon">{icon}</ItemMedia>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{body}</ItemDescription>
      </ItemContent>
      <ArrowRightIcon className="size-4 text-muted-foreground" />
    </Item>
  )
}

function NewPasswordFields({ password, confirm, setPassword, setConfirm }: { password: string; confirm: string; setPassword: (v: string) => void; setConfirm: (v: string) => void }) {
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD
  const mismatch = confirm.length > 0 && confirm !== password
  return (
    <>
      <Field data-invalid={tooShort || undefined}>
        <FieldLabel htmlFor="new-password">Password</FieldLabel>
        <Input id="new-password" type="password" value={password} aria-invalid={tooShort || undefined} onChange={(e) => setPassword(e.target.value)} />
        {tooShort ? <FieldError>Use at least {MIN_PASSWORD} characters.</FieldError> : <FieldDescription>Unlocks Qrypt on this browser. At least {MIN_PASSWORD} characters.</FieldDescription>}
      </Field>
      <Field data-invalid={mismatch || undefined}>
        <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
        <Input id="confirm-password" type="password" value={confirm} aria-invalid={mismatch || undefined} onChange={(e) => setConfirm(e.target.value)} />
        {mismatch && <FieldError>The passwords don't match.</FieldError>}
      </Field>
    </>
  )
}

const passwordOk = (password: string, confirm: string) => password.length >= MIN_PASSWORD && password === confirm

function PasswordCard({ disabled, onSubmit, onBack }: { disabled: boolean; onSubmit: (password: string) => void; onBack: () => void }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Choose a password</CardTitle>
        <CardDescription>It encrypts your Falcon key in this browser. Qrypt locks itself after 15 idle minutes.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <NewPasswordFields password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} />
        </FieldGroup>
      </CardContent>
      <CardFooter className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button disabled={disabled || !passwordOk(password, confirm)} onClick={() => onSubmit(password)}>
          <KeyRoundIcon data-icon="inline-start" />
          Create wallet
        </Button>
      </CardFooter>
    </Card>
  )
}

function CreatingCard({ stage }: { stage: OnboardStage | null }) {
  const current = stage ? STAGES.findIndex((s) => s.key === stage) : -1
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Setting up your wallet</CardTitle>
      </CardHeader>
      <CardContent>
        <ItemGroup>
          {STAGES.map((s, i) => (
            <Item key={s.key} size="sm">
              <ItemMedia>
                <span
                  data-state={i < current ? "done" : i === current ? "active" : "todo"}
                  className="flex size-7 items-center justify-center rounded-full border font-mono text-xs data-[state=done]:border-success data-[state=done]:bg-success data-[state=done]:text-success-foreground"
                >
                  {i < current ? <CheckIcon className="size-3.5" /> : i === current ? <Spinner className="size-3.5" /> : i + 1}
                </span>
              </ItemMedia>
              <ItemContent>
                <ItemTitle className={i > current ? "text-muted-foreground" : undefined}>{s.title}</ItemTitle>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

function ImportCard({ disabled, onImport, onBack }: { disabled: boolean; onImport: (file: File, backupPassword: string, password: string) => Promise<void>; onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [backupPassword, setBackupPassword] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (!file) return
    setWorking(true)
    setError(null)
    try {
      await onImport(file, backupPassword, password)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWorking(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Import a backup</CardTitle>
        <CardDescription>We decrypt it here and check onchain that the key still controls the account.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="import-file">Backup file</FieldLabel>
            <Input id="import-file" type="file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="import-backup-password">Backup password</FieldLabel>
            <Input id="import-backup-password" type="password" value={backupPassword} aria-invalid={!!error || undefined} onChange={(e) => setBackupPassword(e.target.value)} />
            {error ? <FieldError>{error}</FieldError> : <FieldDescription>The one you chose when you made the backup.</FieldDescription>}
          </Field>
          <NewPasswordFields password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} />
        </FieldGroup>
      </CardContent>
      <CardFooter className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button disabled={disabled || !file || !backupPassword || !passwordOk(password, confirm) || working} onClick={submit}>
          {working ? <Spinner data-icon="inline-start" /> : <FileUpIcon data-icon="inline-start" />}
          Import
        </Button>
      </CardFooter>
    </Card>
  )
}

function DoneCard({ account, imported }: { account: string; imported: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{imported ? "Account imported" : "Your wallet is ready"}</CardTitle>
        <CardDescription className="font-mono">{short(account, 6)}</CardDescription>
      </CardHeader>
      <CardContent>
        <Item variant="muted" size="sm">
          <ItemMedia variant="icon">
            <PinIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Pin Qrypt to your toolbar</ItemTitle>
            <ItemDescription>Click the puzzle icon next to the address bar, then the pin next to Qrypt.</ItemDescription>
          </ItemContent>
        </Item>
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={() => openFullscreen()}>
          Open wallet
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  )
}

void mount(<Onboarding />)

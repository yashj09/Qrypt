import { AtomIcon, KeyRoundIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

interface Props {
  busy: boolean
  disabled: boolean
  onCreate: () => void
}

export function OnboardCard({ busy, disabled, onCreate }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Get a quantum-safe account</CardTitle>
        <CardDescription>Takes about 15 seconds. You don't need ETH or a wallet extension.</CardDescription>
        <CardAction>
          <Badge variant="secondary">
            <AtomIcon data-icon="inline-start" />
            Falcon-512
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>1. This browser generates a Falcon-512 key. The private key never leaves your device.</p>
        <p>2. Only the public key is sent. A factory deploys an account that accepts nothing but that key.</p>
        <p>3. The account is staked for the alt mempool's larger validation budget and gets 100 test USDC. It holds 0 ETH.</p>
      </CardContent>
      <CardFooter>
        <Button size="lg" className="w-full" disabled={disabled || busy} onClick={onCreate}>
          {busy ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon data-icon="inline-start" />}
          {busy ? "Creating your account onchain" : "Create my quantum-safe account"}
        </Button>
      </CardFooter>
    </Card>
  )
}

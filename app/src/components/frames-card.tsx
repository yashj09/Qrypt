import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const FRAMES = [
  {
    mode: "VERIFY",
    runsAs: "Your account",
    does: "Reads the signature hash and the Falcon signature, checks it with the ZKNOX falcon8 verifier, approves execution.",
    canonical: "~0.7M gas, over the 100k cap",
  },
  {
    mode: "VERIFY",
    runsAs: "USDC paymaster",
    does: "Checks that the next frame repays at least the quoted fee in USDC and that you hold it, approves payment.",
    canonical: "Reads storage outside tx.sender",
  },
  {
    mode: "SENDER",
    runsAs: "Your account",
    does: "usdc.transfer(paymaster, fee): repays the gas in USDC.",
    canonical: null,
  },
  {
    mode: "SENDER",
    runsAs: "Your account",
    does: "usdc.transfer(recipient, amount): the payment.",
    canonical: null,
  },
] as const

export function FramesCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>One EIP-8141 frame transaction</CardTitle>
        <CardDescription>
          No bundler, no relayer, no paymaster server. Validation is code running in VERIFY frames.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Frame</TableHead>
              <TableHead>What it does</TableHead>
              <TableHead>Canonical mempool</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {FRAMES.map((f, i) => (
              <TableRow key={i}>
                <TableCell className="tabular-nums">{i}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={f.mode === "VERIFY" ? "default" : "secondary"}>{f.mode}</Badge>
                    <span className="text-xs text-muted-foreground">{f.runsAs}</span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal">{f.does}</TableCell>
                <TableCell className="whitespace-normal">
                  {f.canonical ? <Badge variant="destructive">{f.canonical}</Badge> : <span className="text-muted-foreground">fine</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

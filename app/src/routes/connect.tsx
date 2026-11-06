import { useEffect, useMemo, useState } from "react"
import { AtomIcon, CheckCircle2Icon, ExternalLinkIcon, GlobeIcon, XCircleIcon } from "lucide-react"
import type { Address } from "viem"
import { Wordmark } from "@/components/brand/logo"
import { NetworkBadge } from "@/components/brand/network-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { execute, review, type Review } from "@/lib/connect/approve"
import { channelFromLocation, type Channel } from "@/lib/connect/channel"
import { USER_REJECTED, type QryptRequest, type RpcError } from "@/lib/connect/protocol"
import { loadDeployment, storedAccount, type Deployment } from "@/lib/qpay"
import { short, usdcAmount } from "@/lib/format"

type State =
  | { kind: "loading" }
  | { kind: "no-channel" }
  | { kind: "needs-account"; request: QryptRequest }
  | { kind: "review"; request: QryptRequest; review: Review }
  | { kind: "working"; request: QryptRequest; review: Review }
  | { kind: "done"; approved: boolean }
  | { kind: "failed"; message: string }

const TITLES: Record<Review["kind"], { title: string; action: string }> = {
  connect: { title: "Connect to Qrypt", action: "Connect" },
  message: { title: "Sign a message", action: "Sign" },
  typed: { title: "Sign structured data", action: "Sign" },
  transaction: { title: "Approve a transaction", action: "Sign and send" },
}

const asRpcError = (e: unknown): RpcError =>
  typeof e === "object" && e && "code" in e && "message" in e ? (e as RpcError) : { code: -32603, message: String((e as Error)?.message ?? e) }

/** The approval screen. The website opens it as a popup; the extension renders it in its own window. */
export default function ConnectPage({ channel: given }: { channel?: Channel | null }) {
  const channel = useMemo(() => (given === undefined ? channelFromLocation() : given), [given])
  const [state, setState] = useState<State>(channel ? { kind: "loading" } : { kind: "no-channel" })
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [account, setAccount] = useState<Address | null>(null)

  const load = (d: Deployment, request: QryptRequest) => {
    const a = storedAccount(d)
    setAccount(a)
    if (!a) return setState({ kind: "needs-account", request })
    try {
      setState({ kind: "review", request, review: review(d, a, request) })
    } catch (e) {
      channel?.respond({ id: request.id, error: asRpcError(e) })
      setState({ kind: "failed", message: asRpcError(e).message })
    }
  }

  useEffect(() => {
    if (!channel) return
    Promise.all([loadDeployment(), channel.request])
      .then(([d, request]) => {
        setDeployment(d)
        load(d, request)
      })
      .catch((e) => setState({ kind: "failed", message: String(e?.message ?? e) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  const finish = (approved: boolean) => {
    setState({ kind: "done", approved })
    setTimeout(() => window.close(), 1200)
  }

  const reject = (request: QryptRequest) => {
    channel?.respond({ id: request.id, error: USER_REJECTED })
    finish(false)
  }

  const approve = async (request: QryptRequest, r: Review) => {
    if (!deployment || !account || !channel) return
    setState({ kind: "working", request, review: r })
    try {
      channel.respond({ id: request.id, result: await execute(deployment, account, r) })
      finish(true)
    } catch (e) {
      const err = asRpcError(e)
      channel.respond({ id: request.id, error: err })
      setState({ kind: "failed", message: err.message })
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <Wordmark />
        <NetworkBadge />
      </header>
      <main className="flex flex-1 items-start justify-center p-4">
        <div className="flex w-full max-w-md flex-col gap-4">
          {state.kind === "loading" && <Skeleton className="h-64 w-full" />}
          {state.kind === "no-channel" && (
            <Alert>
              <AlertTitle>Nothing to approve</AlertTitle>
              <AlertDescription>This page opens when a dapp asks Qrypt to connect, sign or send.</AlertDescription>
            </Alert>
          )}
          {state.kind === "needs-account" && deployment && (
            <Card>
              <CardHeader>
                <CardTitle>No Qrypt account in this browser</CardTitle>
                <CardDescription>{hostOf(state.request.origin)} wants to connect. Create or restore an account first.</CardDescription>
              </CardHeader>
              <CardFooter className="flex-col items-stretch gap-2">
                <Button nativeButton={false} render={<a href="/app" target="_blank" rel="noreferrer" />}>
                  Open Qrypt
                  <ExternalLinkIcon data-icon="inline-end" />
                </Button>
                <Button variant="outline" onClick={() => load(deployment, state.request)}>
                  I've created one, continue
                </Button>
                <Button variant="ghost" onClick={() => reject(state.request)}>
                  Reject
                </Button>
              </CardFooter>
            </Card>
          )}
          {(state.kind === "review" || state.kind === "working") && deployment && account && (
            <Card>
              <CardHeader>
                <CardDescription className="flex items-center gap-2">
                  <GlobeIcon className="size-4" />
                  <span className="font-medium text-foreground">{hostOf(state.request.origin)}</span>
                  asks to
                </CardDescription>
                <CardTitle className="text-xl">{TITLES[state.review.kind].title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ReviewBody review={state.review} />
                <Separator />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Account</dt>
                  <dd className="text-right font-mono">{short(account, 6)}</dd>
                  <dt className="text-muted-foreground">Signature</dt>
                  <dd className="flex justify-end">
                    <Badge variant="secondary">
                      <AtomIcon data-icon="inline-start" />
                      Falcon-512
                    </Badge>
                  </dd>
                  {state.review.kind === "transaction" && (
                    <>
                      <dt className="text-muted-foreground">Network fee</dt>
                      <dd className="text-right tabular-nums">{usdcAmount(state.review.fee)} USDC</dd>
                      <dt className="text-muted-foreground">ETH spent on gas</dt>
                      <dd className="text-right tabular-nums">0</dd>
                    </>
                  )}
                </dl>
              </CardContent>
              <CardFooter className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={state.kind === "working"} onClick={() => reject(state.request)}>
                  Reject
                </Button>
                <Button disabled={state.kind === "working"} onClick={() => approve(state.request, state.review)}>
                  {state.kind === "working" && <Spinner data-icon="inline-start" />}
                  {TITLES[state.review.kind].action}
                </Button>
              </CardFooter>
            </Card>
          )}
          {state.kind === "done" && (
            <Alert>
              {state.approved ? <CheckCircle2Icon /> : <XCircleIcon />}
              <AlertTitle>{state.approved ? "Done" : "Rejected"}</AlertTitle>
              <AlertDescription>This window closes by itself.</AlertDescription>
            </Alert>
          )}
          {state.kind === "failed" && (
            <Alert variant="destructive">
              <XCircleIcon />
              <AlertTitle>Couldn't complete the request</AlertTitle>
              <AlertDescription className="break-all">{state.message}</AlertDescription>
            </Alert>
          )}
        </div>
      </main>
    </div>
  )
}

function ReviewBody({ review }: { review: Review }) {
  switch (review.kind) {
    case "connect":
      return (
        <p className="text-sm text-muted-foreground">
          The site will see your address and can ask you to sign or send. It can't move anything without your approval.
        </p>
      )
    case "message":
      return <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{review.text}</pre>
    case "typed":
      return (
        <div className="flex flex-col gap-2">
          <span className="text-sm">
            {review.domain} · <span className="font-mono">{review.primaryType}</span>
          </span>
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">{review.json}</pre>
        </div>
      )
    case "transaction":
      return (
        <ItemGroup className="gap-2">
          {review.calls.map((c, i) => (
            <Item key={i} size="xs" variant="muted">
              <ItemContent>
                <ItemTitle>{c.label}</ItemTitle>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )
  }
}

function hostOf(origin: string) {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

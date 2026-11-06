import { useEffect, useMemo, useState } from "react"
import { BadgeCheckIcon, CoinsIcon, DropletIcon, LogInIcon, PlugIcon, WalletIcon } from "lucide-react"
import { createPublicClient, encodeFunctionData, erc20Abi, hashMessage, http, parseAbi, toHex, type Address, type Hex } from "viem"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { createEyriePopupProvider, type Eip1193Provider } from "@/lib/connect/popup-provider"
import { NODE_RPC } from "@/lib/site"
import { short, units } from "@/lib/format"

/** This page plays an unrelated third-party dapp. It knows Eyrie only as an EIP-1193 provider. */

interface Deployment {
  chainId: number
  tokens: { address: Address; symbol: string; decimals: number }[]
}
const deployments = import.meta.glob<Deployment>("../../../deployments/[0-9]*.json", { eager: true, import: "default" })
const token = Object.values(deployments).find((d) => d.chainId === 1337)?.tokens.find((t) => t.symbol === "tEUR")

const publicClient = createPublicClient({ transport: http(NODE_RPC) })
const mintAbi = parseAbi(["function mint(address to, uint256 amount)"])
const erc1271Abi = parseAbi(["function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"])
const CLAIM = 50_000_000n

interface Wallet {
  id: string
  name: string
  icon?: string
  provider: Eip1193Provider
}

interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string }
  provider: Eip1193Provider
}

/** EIP-6963: wallets announce themselves, so the dapp can list every installed one instead of fighting over window.ethereum. */
function useAnnouncedWallets(): Wallet[] {
  const [wallets, setWallets] = useState<Wallet[]>([])
  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const { info, provider } = (event as CustomEvent<Eip6963Detail>).detail
      setWallets((prev) => (prev.some((w) => w.id === info.uuid) ? prev : [...prev, { id: info.uuid, name: info.name, icon: info.icon, provider }]))
    }
    window.addEventListener("eip6963:announceProvider", onAnnounce)
    window.dispatchEvent(new Event("eip6963:requestProvider"))
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce)
  }, [])
  return wallets
}

interface LogLine {
  method: string
  outcome: string
  ok: boolean
}

export default function DappPage() {
  const announced = useAnnouncedWallets()
  const popup = useMemo<Wallet>(
    () => ({ id: "eyrie-popup", name: "Eyrie (popup, nothing to install)", provider: createEyriePopupProvider({ walletUrl: window.location.origin, rpcUrl: NODE_RPC }) }),
    [],
  )
  const wallets = [...announced, popup]
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [address, setAddress] = useState<Address | null>(null)
  const [busy, setBusy] = useState<"connect" | "sign" | "claim" | null>(null)
  const [signIn, setSignIn] = useState<{ verified: boolean } | null>(null)
  const [claim, setClaim] = useState<{ hash: Hex; block?: bigint } | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)
  const [log, setLog] = useState<LogLine[]>([])

  const call = async (w: Wallet, method: string, params: unknown[] = []) => {
    try {
      const result = await w.provider.request({ method, params })
      const shown = typeof result === "string" && result.length > 26 ? `${result.slice(0, 26)}…` : JSON.stringify(result)
      setLog((l) => [{ method, outcome: shown, ok: true }, ...l])
      return result
    } catch (e) {
      const err = e as { code?: number; message?: string }
      setLog((l) => [{ method, outcome: `${err.code ?? ""} ${err.message ?? e}`, ok: false }, ...l])
      throw e
    }
  }

  useEffect(() => {
    if (!address || !token) return
    const tick = () => publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [address] }).then(setBalance, () => {})
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [address])

  const connect = async (w: Wallet) => {
    setBusy("connect")
    try {
      const [a] = (await call(w, "eth_requestAccounts")) as Address[]
      await call(w, "eth_chainId")
      setWallet(w)
      setAddress(a)
    } finally {
      setBusy(null)
    }
  }

  const signInWithEyrie = async () => {
    if (!wallet || !address) return
    setBusy("sign")
    setSignIn(null)
    try {
      const message = [
        `${window.location.host} wants you to sign in with your Ethereum account:`,
        address,
        "",
        "Sign in to the tEUR faucet.",
        "",
        `URI: ${window.location.origin}`,
        "Version: 1",
        "Chain ID: 1337",
        `Nonce: ${crypto.randomUUID().slice(0, 8)}`,
        `Issued At: ${new Date().toISOString()}`,
      ].join("\n")
      const signature = (await call(wallet, "personal_sign", [toHex(message), address])) as Hex
      const magic = await publicClient.readContract({ address, abi: erc1271Abi, functionName: "isValidSignature", args: [hashMessage(message), signature] })
      setSignIn({ verified: magic === "0x1626ba7e" })
    } finally {
      setBusy(null)
    }
  }

  const claimTokens = async () => {
    if (!wallet || !address || !token) return
    setBusy("claim")
    setClaim(null)
    try {
      const data = encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [address, CLAIM] })
      const hash = (await call(wallet, "eth_sendTransaction", [{ from: address, to: token.address, data }])) as Hex
      setClaim({ hash })
      for (let i = 0; i < 45; i++) {
        const receipt = (await wallet.provider.request({ method: "eth_getTransactionReceipt", params: [hash] })) as { blockNumber?: Hex } | null
        if (receipt?.blockNumber) {
          setClaim({ hash, block: BigInt(receipt.blockNumber) })
          break
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <span className="flex items-center gap-2 font-semibold">
            <DropletIcon className="size-5" />
            tEUR Faucet
          </span>
          <Badge variant="outline">Demo third-party dapp</Badge>
        </div>
      </header>
      <main className="mx-auto grid max-w-4xl gap-6 px-6 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Wallet</CardTitle>
              <CardDescription>
                {address ? `Connected through ${wallet?.name}` : "Pick a wallet. Installed ones announce themselves through EIP-6963."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {address ? (
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm">{address}</span>
                  <span className="text-sm text-muted-foreground">
                    tEUR balance: {balance !== null && token ? units(balance, token.decimals) : "…"}
                  </span>
                </div>
              ) : (
                <ItemGroup>
                  {wallets.map((w) => (
                    <Item key={w.id} variant="outline" size="sm">
                      <ItemMedia>{w.icon ? <img src={w.icon} alt="" className="size-6" /> : <WalletIcon />}</ItemMedia>
                      <ItemContent>
                        <ItemTitle>{w.name}</ItemTitle>
                      </ItemContent>
                      <ItemActions>
                        <Button size="sm" disabled={busy !== null} onClick={() => connect(w)}>
                          {busy === "connect" ? <Spinner data-icon="inline-start" /> : <PlugIcon data-icon="inline-start" />}
                          Connect
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>
                A sign-in message, signed with Falcon-512. The dapp verifies it by asking your account onchain (ERC-1271).
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex-col items-stretch gap-3">
              <Button disabled={!address || busy !== null} onClick={signInWithEyrie}>
                {busy === "sign" ? <Spinner data-icon="inline-start" /> : <LogInIcon data-icon="inline-start" />}
                Sign in with Eyrie
              </Button>
              {signIn && (
                <Badge variant={signIn.verified ? "success" : "destructive"}>
                  <BadgeCheckIcon data-icon="inline-start" />
                  {signIn.verified ? "Signature verified onchain via ERC-1271" : "Signature did not verify"}
                </Badge>
              )}
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Claim 50 tEUR</CardTitle>
              <CardDescription>The dapp asks for a plain eth_sendTransaction. Eyrie turns it into a frame transaction and pays the gas in USDC.</CardDescription>
            </CardHeader>
            <CardFooter className="flex-col items-stretch gap-3">
              <Button disabled={!address || busy !== null || !token} onClick={claimTokens}>
                {busy === "claim" ? <Spinner data-icon="inline-start" /> : <CoinsIcon data-icon="inline-start" />}
                Claim 50 tEUR
              </Button>
              {claim && (
                <span className="text-sm text-muted-foreground">
                  <span className="font-mono">{short(claim.hash, 8)}</span>{" "}
                  {claim.block !== undefined ? `included in block ${claim.block}` : "waiting for a block…"}
                </span>
              )}
            </CardFooter>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>EIP-1193 calls</CardTitle>
            <CardDescription>Everything this dapp asked the wallet, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {log.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyTitle>No calls yet</EmptyTitle>
                  <EmptyDescription>Connect a wallet to start.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ItemGroup className="gap-2">
                {log.map((l, i) => (
                  <Item key={i} size="xs" variant="muted">
                    <ItemContent>
                      <ItemTitle className="font-mono">{l.method}</ItemTitle>
                      <ItemDescription className="font-mono text-xs break-all">{l.outcome}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Badge variant={l.ok ? "success" : "destructive"}>{l.ok ? "ok" : "error"}</Badge>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

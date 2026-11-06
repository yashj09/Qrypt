import { decodeFunctionData, erc20Abi, hashMessage, hashTypedData, hexToString, isAddress, isHex, parseAbi, type Address, type Hex } from "viem"
import { bytesToHex, defaultGas, hexToBytes, type Call } from "@qpay/frametx"
import { estimateFee, prepareCalls, signer, toAlt, toStock, type Deployment } from "@/lib/qpay"
import { short, units } from "@/lib/format"
import type { EyrieRequest, RpcError } from "@/lib/connect/protocol"

/** What the user is asked to approve, already parsed and validated. */
export type Review =
  | { kind: "connect" }
  | { kind: "message"; text: string; hash: Hex }
  | { kind: "typed"; domain: string; primaryType: string; json: string; hash: Hex }
  | { kind: "transaction"; calls: Call[]; fee: bigint }

const invalid = (message: string): RpcError => ({ code: -32602, message })

const mintAbi = parseAbi(["function mint(address to, uint256 amount)"])

/** A human description of one call, decoded when it's a token call we recognise. */
export function describeCall(d: Deployment, call: Call): string {
  const token = [{ address: d.usdc, symbol: "USDC", decimals: 6 }, ...d.tokens].find(
    (t) => t.address.toLowerCase() === call.to.toLowerCase(),
  )
  if (call.data && call.data !== "0x" && token) {
    try {
      const { functionName, args } = decodeFunctionData({ abi: [...erc20Abi, ...mintAbi], data: call.data })
      const amount = (n: unknown) => `${units(n as bigint, token.decimals)} ${token.symbol}`
      if (functionName === "transfer") return `Send ${amount(args[1])} to ${short(args[0] as string, 4)}`
      if (functionName === "mint") return `Mint ${amount(args[1])} to ${short(args[0] as string, 4)}`
      if (functionName === "approve") return `Let ${short(args[0] as string, 4)} spend ${amount(args[1])}`
    } catch {
      // Not a token call we know; fall through to the raw description.
    }
  }
  const value = call.value ? `${units(call.value, 18)} ETH` : ""
  if (!call.data || call.data === "0x") return `Send ${value || "0 ETH"} to ${short(call.to, 4)}`
  return `Call ${short(call.to, 4)} (${call.data.slice(0, 10)})${value ? ` with ${value}` : ""}`
}

interface TxParams {
  from?: string
  to?: string
  data?: string
  value?: string
  gas?: string
}

export function review(d: Deployment, account: Address, req: EyrieRequest): Review {
  switch (req.method) {
    case "eth_requestAccounts":
      return { kind: "connect" }
    case "personal_sign": {
      const [raw] = req.params as [string, string]
      if (typeof raw !== "string") throw invalid("personal_sign needs a message")
      const text = isHex(raw) ? safeText(raw) : raw
      return { kind: "message", text, hash: hashMessage(isHex(raw) ? { raw } : raw) }
    }
    case "eth_signTypedData_v4": {
      const [, json] = req.params as [string, string]
      const typed = typeof json === "string" ? JSON.parse(json) : json
      return {
        kind: "typed",
        domain: typed.domain?.name ?? "Unnamed app",
        primaryType: typed.primaryType,
        json: JSON.stringify(typed.message, null, 2),
        hash: hashTypedData(typed),
      }
    }
    case "eth_sendTransaction": {
      const [tx] = req.params as [TxParams]
      if (!tx?.to || !isAddress(tx.to)) throw invalid("eth_sendTransaction needs a `to` address; contract creation isn't supported")
      if (tx.from && tx.from.toLowerCase() !== account.toLowerCase()) throw invalid("`from` isn't this account")
      const gas = tx.gas ? BigInt(tx.gas) : 0n
      const call: Call = {
        to: tx.to,
        data: (tx.data as Hex | undefined) ?? "0x",
        value: tx.value ? BigInt(tx.value) : 0n,
        label: "Dapp call",
        gas: gas > defaultGas.call.execution ? { execution: gas, state: defaultGas.call.state } : defaultGas.call,
      }
      call.label = describeCall(d, call)
      return { kind: "transaction", calls: [call], fee: estimateFee(d, account, [call]) }
    }
  }
}

function safeText(raw: Hex) {
  try {
    return hexToString(raw)
  } catch {
    return raw
  }
}

/** Signs or sends what was reviewed. Signatures are Falcon-512 over the EIP-191/712 hash, checkable via ERC-1271. */
export async function execute(d: Deployment, account: Address, r: Review): Promise<unknown> {
  switch (r.kind) {
    case "connect":
      return [account]
    case "message":
    case "typed":
      return bytesToHex(await (await signer()).sign(hexToBytes(r.hash)))
    case "transaction": {
      const prepared = await prepareCalls(d, account, r.calls)
      const alt = await toAlt(prepared)
      if (alt.accepted) return prepared.hash
      const stock = await toStock(prepared)
      if (stock.accepted) return prepared.hash
      throw { code: -32000, message: alt.reason } satisfies RpcError
    }
  }
}

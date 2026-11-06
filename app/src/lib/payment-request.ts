import { formatUnits, getAddress, isAddress, type Address } from "viem"

/**
 * What a QR code or link asks you to pay. Accepts our pay links (https://<any host>/pay?to=…&amount=…&asset=…),
 * EIP-681 URIs (ethereum:0x…@1337?value=…, ethereum:<token>@1337/transfer?address=…&uint256=…), and bare addresses.
 * `amount` is human units ("5", "0.25"); `asset` is a symbol or token address, absent meaning USDC.
 */
export interface PaymentRequest {
  to: Address
  amount?: string
  asset?: string
}

const ETH_DECIMALS = 18

/** EIP-681 numbers may be plain integers or scientific ("2.014e18"). */
function eip681Number(raw: string): bigint | null {
  const m = raw.match(/^(\d+)(?:\.(\d+))?(?:e(\d+))?$/i)
  if (!m) return null
  const [, int, frac = "", exp = "0"] = m
  const e = Number(exp) - frac.length
  if (e < 0) return null
  return BigInt(int + frac) * 10n ** BigInt(e)
}

export function parsePaymentRequest(text: string, tokenDecimals: (token: Address) => number | undefined = () => 6): PaymentRequest | null {
  const s = text.trim()
  if (isAddress(s)) return { to: getAddress(s) }

  if (s.toLowerCase().startsWith("ethereum:")) {
    const m = s.match(/^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@\d+)?(\/[a-zA-Z]+)?(?:\?(.*))?$/)
    if (!m) return null
    const [, target, fn, query = ""] = m
    const q = new URLSearchParams(query)
    if (fn === "/transfer") {
      const to = q.get("address")
      if (!to || !isAddress(to)) return null
      const raw = q.get("uint256")
      const decimals = tokenDecimals(getAddress(target))
      const units = raw ? eip681Number(raw) : null
      return {
        to: getAddress(to),
        asset: getAddress(target),
        amount: units !== null && decimals !== undefined ? formatUnits(units, decimals) : undefined,
      }
    }
    if (fn) return null
    const value = q.get("value")
    const wei = value ? eip681Number(value) : null
    return { to: getAddress(target), asset: "ETH", amount: wei !== null ? formatUnits(wei, ETH_DECIMALS) : undefined }
  }

  let url: URL
  try {
    url = new URL(s)
  } catch {
    return null
  }
  if (!/\/pay\/?$/.test(url.pathname)) return null
  const to = url.searchParams.get("to")
  if (!to || !isAddress(to)) return null
  const amount = url.searchParams.get("amount") ?? undefined
  if (amount !== undefined && !/^\d+(\.\d+)?$/.test(amount)) return null
  return { to: getAddress(to), amount, asset: url.searchParams.get("asset") ?? undefined }
}

/** A link anyone can open (or scan with the iPhone camera) to pay `req` from Qrypt. */
export function payLink(origin: string, req: PaymentRequest): string {
  const q = new URLSearchParams({ to: req.to })
  if (req.amount) q.set("amount", req.amount)
  if (req.asset && req.asset.toUpperCase() !== "USDC") q.set("asset", req.asset)
  return `${origin}/pay?${q}`
}

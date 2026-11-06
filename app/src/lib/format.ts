import { formatEther, formatUnits } from "viem"

export const usdc = (v: bigint) => `${Number(formatUnits(v, 6)).toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC`
export const eth = (v: bigint) => `${Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH`
export const short = (hex: string, n = 6) => (hex.length > 2 * n + 2 ? `${hex.slice(0, n + 2)}…${hex.slice(-n)}` : hex)
export const gas = (v: bigint) => `${Number(v).toLocaleString()} gas`
export const usdcAmount = (v: bigint) =>
  Number(formatUnits(v, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
export const ago = (at: number) => {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  return `${Math.floor(s / 3600)} h ago`
}
export const units = (v: bigint, decimals: number) =>
  Number(formatUnits(v, decimals)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals > 6 ? 6 : 4 })
export const dollars = (v: bigint) =>
  Number(formatUnits(v, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Parses a typed decimal ("12.5", ".5", "3.") into base units without floating point; 0 if it isn't a number. */
export function toBaseUnits(s: string, decimals: number): bigint {
  const m = s.trim().replace(/,/g, "").match(/^(\d*)(?:\.(\d*))?$/)
  if (!m || (!m[1] && !m[2])) return 0n
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0")
  return BigInt(m[1] || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0")
}

/** A dollar figure for display: "$1,234.56", or "<$0.01" for dust. */
export const usd = (v: number) =>
  v > 0 && v < 0.01 ? "<$0.01" : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

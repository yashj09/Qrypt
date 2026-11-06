import { cn } from "@/lib/utils"
import { BRAND } from "@/lib/site"

const NEST = [
  [3.5, 8.5],
  [20.5, 8.5],
  [4.6, 13],
  [19.4, 13],
  [7.4, 16.8],
  [16.6, 16.8],
  [12, 18.6],
] as const

/** Lattice points forming a nest around one key: Falcon is a lattice signature, and an eyrie is a falcon's nest. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <circle cx="12" cy="10.2" r="3.6" />
      {NEST.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.35" />
      ))}
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 text-base font-semibold tracking-tight", className)}>
      <LogoMark className="size-6" />
      {BRAND}
    </span>
  )
}

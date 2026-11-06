import { cn } from "@/lib/utils"
import { BRAND } from "@/lib/site"

const RING = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 - Math.PI / 2
  return [11 + 7.6 * Math.cos(a), 11 + 7.6 * Math.sin(a)] as const
})

/** A "Q" drawn with lattice points: Falcon-512 is a lattice signature, and the tail makes the Q. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 22" fill="currentColor" aria-hidden className={className}>
      {RING.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.45" />
      ))}
      <circle cx="11" cy="11" r="2.6" />
      <circle cx="16.6" cy="16.6" r="1.6" />
      <circle cx="19.4" cy="19.4" r="1.8" />
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

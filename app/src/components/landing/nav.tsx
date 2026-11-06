import { ArrowRightIcon } from "lucide-react"
import { Wordmark } from "@/components/brand/logo"
import { NetworkBadge } from "@/components/brand/network-badge"
import { Button } from "@/components/ui/button"
import { links } from "@/lib/site"

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#mempool", label: "Alt mempool" },
  { href: "#security", label: "Security" },
  { href: "#builders", label: "Builders" },
]

export function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
        <a href="/" aria-label="Eyrie home">
          <Wordmark />
        </a>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Button key={n.href} variant="ghost" size="sm" nativeButton={false} render={<a href={n.href} />}>
              {n.label}
            </Button>
          ))}
          <Button variant="ghost" size="sm" nativeButton={false} render={<a href={links.repo} target="_blank" rel="noreferrer" />}>
            GitHub
          </Button>
        </nav>
        <div className="flex items-center gap-2">
          <NetworkBadge />
          <Button size="sm" nativeButton={false} render={<a href="/app" />}>
            Open app
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </header>
  )
}

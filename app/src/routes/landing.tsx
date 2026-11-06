import { ArrowRightIcon } from "lucide-react"
import { Wordmark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Builders } from "@/components/landing/builders"
import { Hero } from "@/components/landing/hero"
import { How } from "@/components/landing/how"
import { Mempool } from "@/components/landing/mempool"
import { Nav } from "@/components/landing/nav"
import { Security } from "@/components/landing/security"
import { Why } from "@/components/landing/why"
import { links, proof } from "@/lib/site"

export default function Landing() {
  return (
    <div className="flex min-h-svh flex-col">
      <Nav />
      <main>
        <Hero />
        <Why />
        <How />
        <Mempool />
        <Security />
        <Builders />
        <section className="border-t py-24">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 text-center">
            <h2 className="text-4xl font-semibold tracking-tight lg:text-5xl">
              Your dollars, <span className="font-serif font-normal italic">post-quantum.</span>
            </h2>
            <p className="text-muted-foreground">About 15 seconds. No wallet, no ETH. Devnet with test USDC.</p>
            <Button size="lg" nativeButton={false} render={<a href="/app" />}>
              Create an account
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <Wordmark className="text-foreground" />
            <span>Built at ETHGlobal Mumbai 2026 · MIT</span>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" nativeButton={false} render={<a href={links.repo} target="_blank" rel="noreferrer" />}>
              GitHub
            </Button>
            <Button variant="ghost" size="sm" nativeButton={false} render={<a href={proof.explorer} target="_blank" rel="noreferrer" />}>
              Explorer
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}

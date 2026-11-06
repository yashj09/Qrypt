import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn("scroll-mt-16 py-20 lg:py-28", className)}>
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6">{children}</div>
    </section>
  )
}

export function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{eyebrow}</span>
      <h2 className="text-4xl font-semibold tracking-tight text-balance lg:text-5xl [&_em]:font-serif [&_em]:font-normal">
        {title}
      </h2>
      {children && <p className="text-lg text-pretty text-muted-foreground">{children}</p>}
    </div>
  )
}

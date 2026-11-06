import { Maximize2Icon } from "lucide-react"
import { Wordmark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { mount, openFullscreen } from "./mount"

function Popup() {
  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <Wordmark />
        <Button variant="ghost" size="icon-sm" aria-label="Fullscreen" onClick={() => openFullscreen()}>
          <Maximize2Icon />
        </Button>
      </header>
    </div>
  )
}

mount(<Popup />)

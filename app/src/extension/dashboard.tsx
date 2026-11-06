import { Wordmark } from "@/components/brand/logo"
import { mount } from "./mount"

function Dashboard() {
  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside className="w-64 border-r p-6">
        <Wordmark />
      </aside>
    </div>
  )
}

mount(<Dashboard />)

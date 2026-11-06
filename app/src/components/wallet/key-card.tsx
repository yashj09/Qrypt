import type { ReactNode } from "react"
import { KeyRoundIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export function KeyCard({ children, onForget }: { children?: ReactNode; onForget: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          Key and account
        </CardTitle>
        <CardDescription>Your Falcon key exists only in this browser. Nobody, including us, can recover it.</CardDescription>
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
      <CardFooter>
        <Button variant="ghost" size="sm" onClick={onForget}>
          Forget this key on this device
        </Button>
      </CardFooter>
    </Card>
  )
}

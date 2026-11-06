import { ShareIcon, SquarePlusIcon } from "lucide-react"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

/** iOS has no install prompt, so we show the two taps. Push notifications only work once installed. */
export function InstallGuide({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle>Add Qrypt to your Home Screen</SheetTitle>
          <SheetDescription>
            It opens full screen like an app, and it's needed for payment
            notifications on iPhone.
          </SheetDescription>
        </SheetHeader>
        <ItemGroup className="gap-2">
          <Item variant="muted" size="sm">
            <ItemMedia variant="icon">
              <ShareIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>1. Tap Share</ItemTitle>
              <ItemDescription>
                The square with an arrow in Safari's toolbar.
              </ItemDescription>
            </ItemContent>
          </Item>
          <Item variant="muted" size="sm">
            <ItemMedia variant="icon">
              <SquarePlusIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>2. Tap "Add to Home Screen"</ItemTitle>
              <ItemDescription>
                Then open Qrypt from its icon. Face ID recovers your account
                there in one tap.
              </ItemDescription>
            </ItemContent>
          </Item>
        </ItemGroup>
      </SheetContent>
    </Sheet>
  )
}

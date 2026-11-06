import { DeleteIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const

/** A phone keypad that edits a decimal string, capped at `decimals` places. */
export function AmountKeypad({ value, decimals, onChange }: { value: string; decimals: number; onChange: (v: string) => void }) {
  const press = (key: (typeof KEYS)[number]) => {
    if (key === "back") return onChange(value.slice(0, -1))
    if (key === "." && (value.includes(".") || decimals === 0)) return
    if (key !== "." && value.includes(".") && value.split(".")[1].length >= decimals) return
    if (value === "0" && key !== ".") return onChange(key)
    onChange(value === "" && key === "." ? "0." : value + key)
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <Button key={k} variant="ghost" className="h-14 text-2xl font-medium" aria-label={k === "back" ? "Delete" : k} onClick={() => press(k)}>
          {k === "back" ? <DeleteIcon /> : k}
        </Button>
      ))}
    </div>
  )
}

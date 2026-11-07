import { CircleSlashIcon, ShieldQuestionIcon, UserCheckIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { WorldIdError } from "@/lib/world"

/** Why World ID didn't let a sponsored account through, and what the person can do instead (below, on the page). */
export function WorldIssue({ issue }: { issue: WorldIdError }) {
  const already = issue.code === "world_already_used" || issue.code === "max_verifications_reached"
  const cancelled = issue.code === "cancelled" || issue.code === "user_rejected"
  return (
    <Alert variant={cancelled || already ? "default" : "destructive"}>
      {already ? <UserCheckIcon /> : cancelled ? <CircleSlashIcon /> : <ShieldQuestionIcon />}
      <AlertTitle>
        {already ? "You already have a Qrypt account" : cancelled ? "World ID verification cancelled" : "World ID didn't verify you"}
      </AlertTitle>
      <AlertDescription>{issue.message}</AlertDescription>
    </Alert>
  )
}

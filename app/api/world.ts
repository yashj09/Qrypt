import { json } from "./_account-auth.js"
import { WORLD_ACTION, rpContext, worldConfig } from "./_world.js"

/**
 * GET -> { enabled: false } when onboarding isn't gated, or
 *        { enabled: true, app_id, action, environment, rp_context } with a freshly signed request for IDKit.
 */
export function GET(): Response {
  const cfg = worldConfig()
  if (!cfg) return json({ enabled: false })
  return json({ enabled: true, app_id: cfg.appId, action: WORLD_ACTION, environment: cfg.environment, rp_context: rpContext(cfg) })
}

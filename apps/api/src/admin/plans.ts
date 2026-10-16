import { noOverrides, type PlanCatalog } from '@arablyzer/plans'
import type { AdminData } from '@arablyzer/store'

/**
 * The plans with the owner's per-account numbers read over them (M4.8): where any quota is
 * checked, `planOf` asks `overrides` first. An account with none gets the plan as it is.
 */
export function withOverrides(plans: PlanCatalog, admin: AdminData): PlanCatalog {
  return Object.freeze({
    ...plans,
    overrides: async (userId: string) => {
      const { overrides } = await admin.state(userId)
      return noOverrides(overrides) ? null : overrides
    },
  })
}

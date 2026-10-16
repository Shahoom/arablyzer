import type { AccountPlan } from './account-plan'

/**
 * What the owner may set for one account, over its plan (M4.8). Every field is optional: absent
 * means the plan's own number. The panel is the only thing that writes these; quota code reads
 * them first (apps/api `planOf`).
 */
export interface PlanOverrides {
  /** The scans the account may start in a day: a window of this many scans over 86 400 s. At least 1. */
  readonly scansPerDay?: number
  readonly savedSites?: number
  readonly monitoredSites?: number
  readonly crawlPages?: number
  readonly pdfPerMonth?: number
  readonly whiteLabel?: boolean
}

export const OVERRIDE_NUMBER_FIELDS = [
  'scansPerDay',
  'savedSites',
  'monitoredSites',
  'crawlPages',
  'pdfPerMonth',
] as const
export type OverrideNumberField = (typeof OVERRIDE_NUMBER_FIELDS)[number]

/** The smallest and largest value each number may take: a typo cannot make an account unbounded. */
export const OVERRIDE_BOUNDS: Readonly<Record<OverrideNumberField, { min: number; max: number }>> =
  Object.freeze({
    scansPerDay: { min: 1, max: 100_000 },
    savedSites: { min: 0, max: 10_000 },
    monitoredSites: { min: 0, max: 10_000 },
    crawlPages: { min: 0, max: 100_000 },
    pdfPerMonth: { min: 0, max: 10_000 },
  })

export const SECONDS_PER_DAY = 86_400

/** Whether the value is a whole number the field allows. */
export function isOverrideNumber(field: OverrideNumberField, value: unknown): value is number {
  const { min, max } = OVERRIDE_BOUNDS[field]
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

/**
 * What a stored value is worth: the fields it has that are valid, and nothing else. Reads
 * tolerate a row an older or newer version wrote; they never throw.
 */
export function sanitizeOverrides(raw: unknown): PlanOverrides {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const source = raw as Record<string, unknown>
  const clean: { -readonly [K in keyof PlanOverrides]: PlanOverrides[K] } = {}
  for (const field of OVERRIDE_NUMBER_FIELDS) {
    const value = source[field]
    if (isOverrideNumber(field, value)) clean[field] = value
  }
  if (typeof source.whiteLabel === 'boolean') clean.whiteLabel = source.whiteLabel
  return clean
}

/** Whether there is nothing to override. */
export function noOverrides(overrides: PlanOverrides): boolean {
  return Object.keys(overrides).length === 0
}

/** The plan with the account's own numbers put over it. */
export function applyOverrides(plan: AccountPlan, overrides: PlanOverrides): AccountPlan {
  if (noOverrides(overrides)) return plan
  return Object.freeze({
    ...plan,
    ...(overrides.scansPerDay === undefined
      ? {}
      : { scans: Object.freeze({ scans: overrides.scansPerDay, seconds: SECONDS_PER_DAY }) }),
    ...(overrides.savedSites === undefined ? {} : { savedSites: overrides.savedSites }),
    ...(overrides.monitoredSites === undefined ? {} : { monitoredSites: overrides.monitoredSites }),
    ...(overrides.crawlPages === undefined ? {} : { crawlPages: overrides.crawlPages }),
    ...(overrides.pdfPerMonth === undefined ? {} : { pdfPerMonth: overrides.pdfPerMonth }),
    ...(overrides.whiteLabel === undefined ? {} : { whiteLabel: overrides.whiteLabel }),
  })
}

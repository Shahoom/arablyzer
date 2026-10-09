export type Env = Readonly<Record<string, string | undefined>>

/**
 * A reader of the limits' numbers: a whole number of at least 1 from the variable, the
 * development value where it is not set outside production, and a refusal to start where it is
 * not set in production.
 */
export function reader(
  env: Env,
  design = 'Phase 2 design §7.2',
): (name: string, fallback: number) => number {
  const production = env.NODE_ENV === 'production'
  return (name, fallback) => {
    const raw = env[name]?.trim()
    if (raw === undefined || raw === '') {
      if (production) throw new Error(`${name} must be set in production (${design})`)
      return fallback
    }
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
      throw new Error(`${name} must be a whole number of at least 1, not ${raw}`)
    }
    return Number(raw)
  }
}

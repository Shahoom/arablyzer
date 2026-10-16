/** The 95% two-sided normal quantile. */
export const Z95 = 1.959964

export interface Interval {
  readonly p: number
  readonly lo: number
  readonly hi: number
}

/**
 * The Wilson score interval for a proportion of `n` sites of which `k` have the property. It holds
 * its coverage near 0 and 1, where the textbook interval does not, and is defined for `k = 0`.
 */
export function wilson(k: number, n: number, z = Z95): Interval {
  if (n <= 0) throw new RangeError('A proportion needs at least one site')
  if (k < 0 || k > n) throw new RangeError('The count is between 0 and the number of sites')
  return wilsonOf(k / n, n, z)
}

/** The same interval from a proportion and an effective number of sites (which need not be whole). */
export function wilsonOf(p: number, n: number, z = Z95): Interval {
  const z2 = z * z
  const denominator = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denominator
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) }
}

/** One country's sites: the population in the frame, the sites measured, and those with the property. */
export interface Stratum {
  readonly population: number
  readonly n: number
  readonly k: number
}

/**
 * The share over all countries, weighted by the size of each country's list rather than by how many
 * of its sites were reached: a country the sample took a floor from is not over-counted. The
 * interval is Wilson's at the effective sample size that the weighted variance implies (each
 * country's variance with the Agresti-Coull adjustment, which is positive even at 0 or 1). It is the
 * uncertainty of the sample; a site that could not be reached, or a rule that misjudges a page, is
 * a bias it does not cover, and the methodology says so.
 */
export function weightedShare(strata: readonly Stratum[]): Interval | null {
  const used = strata.filter((s) => s.n > 0 && s.population > 0)
  const total = used.reduce((sum, s) => sum + s.population, 0)
  if (used.length === 0 || total === 0) return null
  let p = 0
  let adjusted = 0
  let variance = 0
  let pooled = 0
  for (const s of used) {
    const w = s.population / total
    const pa = (s.k + 2) / (s.n + 4)
    p += (w * s.k) / s.n
    adjusted += w * pa
    variance += (w * w * pa * (1 - pa)) / (s.n + 4)
    pooled += s.n
  }
  if (variance <= 0) return wilsonOf(p, pooled)
  const effective = Math.min(pooled * 4, Math.max(1, (adjusted * (1 - adjusted)) / variance))
  return wilsonOf(p, effective)
}

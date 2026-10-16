import { describe, expect, it } from 'vitest'
import { weightedShare, wilson } from '../src/stats'

describe('the Wilson interval', () => {
  it('matches the known values', () => {
    const half = wilson(5, 10)
    expect(half.p).toBe(0.5)
    expect(half.lo).toBeCloseTo(0.2366, 3)
    expect(half.hi).toBeCloseTo(0.7634, 3)
    const none = wilson(0, 10)
    expect(none.lo).toBeCloseTo(0, 10)
    expect(none.hi).toBeCloseTo(0.2775, 3)
    const all = wilson(10, 10)
    expect(all.hi).toBeCloseTo(1, 10)
    expect(all.lo).toBeCloseTo(0.7225, 3)
  })

  it('narrows as the sample grows and holds p inside its bounds', () => {
    const small = wilson(30, 100)
    const large = wilson(300, 1000)
    expect(large.hi - large.lo).toBeLessThan(small.hi - small.lo)
    for (const { p, lo, hi } of [small, large, wilson(1, 1000), wilson(999, 1000)]) {
      expect(lo).toBeLessThanOrEqual(p)
      expect(hi).toBeGreaterThanOrEqual(p)
    }
  })

  it('refuses what is not a proportion', () => {
    expect(() => wilson(1, 0)).toThrow(RangeError)
    expect(() => wilson(5, 4)).toThrow(RangeError)
    expect(() => wilson(-1, 4)).toThrow(RangeError)
  })
})

describe('the share over all countries', () => {
  it('weights by the size of each country’s list, not by the sites reached', () => {
    // A large country with few sites reached and a small one with many: the large one counts for more.
    const share = weightedShare([
      { population: 9000, n: 100, k: 50 },
      { population: 1000, n: 900, k: 0 },
    ])
    expect(share?.p).toBeCloseTo(0.45, 6)
  })

  it('equals the plain share when the sample is in proportion to the lists', () => {
    const share = weightedShare([
      { population: 600, n: 60, k: 12 },
      { population: 400, n: 40, k: 8 },
    ])
    expect(share?.p).toBeCloseTo(0.2, 6)
    const plain = wilson(20, 100)
    expect(share?.lo).toBeCloseTo(plain.lo, 1)
    expect(share?.hi).toBeCloseTo(plain.hi, 1)
  })

  it('has an interval around zero, and none for nothing measured', () => {
    const none = weightedShare([{ population: 100, n: 50, k: 0 }])
    expect(none?.p).toBe(0)
    expect(none?.hi).toBeGreaterThan(0)
    expect(weightedShare([])).toBeNull()
    expect(weightedShare([{ population: 10, n: 0, k: 0 }])).toBeNull()
  })
})

import { createHash } from 'node:crypto'

/**
 * A number in [0, 1) that depends on the seed and the key alone: the sample is chosen by sorting on
 * it, so the same list and the same seed give the same sample on any machine, in any order of
 * rows, and a site's place in the crawl does not depend on the others.
 */
export function unitHash(seed: string, key: string): number {
  const digest = createHash('sha256').update(`${seed}\u0000${key}`).digest()
  // 48 bits: an integer a double holds exactly.
  return digest.readUIntBE(0, 6) / 2 ** 48
}

/** Orders by the hash, and by the key when two hashes are equal, so the order is total. */
export function byHash<T>(seed: string, keyOf: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => {
    const ka = keyOf(a)
    const kb = keyOf(b)
    const diff = unitHash(seed, ka) - unitHash(seed, kb)
    if (diff !== 0) return diff
    return ka < kb ? -1 : ka > kb ? 1 : 0
  }
}

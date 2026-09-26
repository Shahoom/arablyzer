import type { Engine, RenderedFacts } from '@arablyzer/collectors'
import type { Evidence } from '../rule'

/** The facts of each engine that rendered the page; empty when none did. */
export function renderedFacts(evidence: Evidence | undefined): readonly RenderedFacts[] {
  return evidence?.rendered ?? []
}

/** Some engine rendered text with Arabic letters, whether the HTML held it or a script added it. */
export function hasRenderedArabic(evidence: Evidence | undefined): boolean {
  return renderedFacts(evidence).some((facts) => facts.arabicText.length > 0)
}

export interface Sighting<T> {
  readonly key: string
  /** The engines that reported it, in the order they rendered. */
  readonly engines: readonly Engine[]
  /** What each of them reported. */
  readonly each: ReadonlyMap<Engine, T>
}

/**
 * Collects what several engines report about the same thing on the page (an element, a token in
 * an element), so a rule reports it once. Sightings come out in the order they were first seen:
 * document order in the first engine that saw them.
 */
export class Sightings<T> {
  readonly #byKey = new Map<string, { engines: Engine[]; each: Map<Engine, T> }>()

  add(key: string, engine: Engine, item: T): void {
    const seen = this.#byKey.get(key)
    if (seen === undefined) {
      this.#byKey.set(key, { engines: [engine], each: new Map([[engine, item]]) })
    } else if (!seen.each.has(engine)) {
      seen.engines.push(engine)
      seen.each.set(engine, item)
    }
  }

  *[Symbol.iterator](): Generator<Sighting<T>> {
    for (const [key, { engines, each }] of this.#byKey) yield { key, engines, each }
  }
}

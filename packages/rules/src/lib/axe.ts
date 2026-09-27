import type { A11yNodeFact, A11yRuleId, RenderedFacts } from '@arablyzer/collectors'
import type { Evidence } from '../rule'
import { renderedFacts, Sightings, type Sighting } from './rendered'

/** axe had something to check for this rule in some engine that ran it. */
export function axeApplies(evidence: Evidence | undefined, id: A11yRuleId): boolean {
  return renderedFacts(evidence).some((facts) =>
    (facts.a11y?.rules ?? []).some((rule) => rule.id === id && rule.applicable),
  )
}

/** Some engine has elements that axe could not decide on for this rule. */
export function axeUndecided(evidence: Evidence | undefined, id: A11yRuleId): boolean {
  return renderedFacts(evidence).some((facts) =>
    (facts.a11y?.rules ?? []).some((rule) => rule.id === id && rule.incompleteCount > 0),
  )
}

/**
 * The elements axe reported for one of its rules, once each, with the engines that reported
 * them: what it found wrong, or what it could not decide.
 */
export function axeNodes(
  rendered: readonly RenderedFacts[],
  id: A11yRuleId,
  kind: 'violations' | 'incomplete',
): Sighting<A11yNodeFact>[] {
  const nodes = new Sightings<A11yNodeFact>()
  for (const facts of rendered) {
    const rule = facts.a11y?.rules.find((item) => item.id === id)
    for (const node of rule?.[kind] ?? []) nodes.add(node.selector, facts.engine, node)
  }
  return [...nodes]
}

/** A finding at an element axe reported, with where it saw it. */
export function atNode({ key, engines, each }: Sighting<A11yNodeFact>): {
  readonly node: A11yNodeFact | undefined
  readonly evidence: {
    readonly selector: string
    readonly snippet?: string
    readonly engines: typeof engines
  }
} {
  const node = engines[0] === undefined ? undefined : each.get(engines[0])
  return {
    node,
    evidence: {
      selector: key,
      ...(node === undefined || node.snippet === '' ? {} : { snippet: node.snippet }),
      engines,
    },
  }
}

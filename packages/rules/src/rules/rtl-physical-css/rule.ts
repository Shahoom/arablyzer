import type { Engine, PhysicalCssFact } from '@arablyzer/collectors'
import { renderedFacts } from '../../lib/rendered'
import { defineRule, type DetectorFinding } from '../../rule'

/** A file named for right-to-left pages (style-rtl.css, bootstrap.rtl.min.css) is written for them. */
function namedForRtl(url: string): boolean {
  let name: string
  try {
    name = new URL(url).pathname.split('/').at(-1) ?? ''
  } catch {
    return false
  }
  return /(?:^|[^a-z])rtl(?:[^a-z]|$)/i.test(name)
}

/**
 * Stylesheets of a right-to-left page that set sides by left and right rather than by start and
 * end (CSS Logical Properties 1). Such a theme serves one direction only: information, never
 * deducted. Rules and files written for right-to-left pages on purpose are left out.
 */
export const rule = defineRule({
  id: 'rtl-physical-css',
  version: '1.0.0',
  category: 'rtl',
  severity: 'info',
  needs: ['render', 'files'],
  messages: ['physical'],
  appliesTo: (_page, evidence) =>
    renderedFacts(evidence).some((facts) => facts.dir === 'rtl' && facts.stylesheets.read > 0),
  detect: ({ rendered = [] }) => {
    // One finding for each stylesheet, whichever engines read it: the most it counted.
    const sheets = new Map<string, { fact: PhysicalCssFact; engines: Engine[] }>()
    for (const facts of rendered) {
      if (facts.dir !== 'rtl') continue
      for (const fact of facts.stylesheets.physical) {
        if (!fact.inline && namedForRtl(fact.url)) continue
        const key = fact.inline ? 'inline' : fact.url
        const seen = sheets.get(key)
        if (seen === undefined) {
          sheets.set(key, { fact, engines: [facts.engine] })
        } else {
          if (!seen.engines.includes(facts.engine)) seen.engines.push(facts.engine)
          if (fact.count > seen.fact.count) seen.fact = fact
        }
      }
    }
    return [...sheets.entries()].map(([key, { fact, engines }]): DetectorFinding<'physical'> => {
      const [first] = fact.examples
      return {
        message: 'physical',
        values: { count: fact.count },
        url: fact.url,
        ...(first === undefined
          ? {}
          : {
              snippet: `${first.selector} { ${first.property}: ${first.value} }`,
              // The lines of a <style> element are its own, not the page's.
              ...(fact.inline ? {} : { location: { line: first.line, column: first.column } }),
            }),
        engines,
        key,
      }
    })
  },
})

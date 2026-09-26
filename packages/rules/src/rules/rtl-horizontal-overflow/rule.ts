import type { RenderedElement, RenderedFacts } from '@arablyzer/collectors'
import { renderedFacts, Sightings } from '../../lib/rendered'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'element' | 'page'

/** A viewport meta with width=device-width: the page says it is laid out for the phone's width. */
export function declaresDeviceWidth(content: string | null): boolean {
  return (content ?? '').split(/[,;]/).some((part) => {
    const [name, value] = part.split('=').map((side) => side.trim().toLowerCase())
    return name === 'width' && value === 'device-width'
  })
}

/**
 * The browser does not apply the viewport meta (Playwright cannot in Firefox), so only pages that
 * ask for the device width are held to the screen's width (docs/design/plans/m1.1-browser.md §3).
 */
function madeForPhones(facts: RenderedFacts): boolean {
  return facts.dir === 'rtl' && declaresDeviceWidth(facts.viewportMeta)
}

/**
 * How far the element reaches past the end edge of the screen, the only one a page scrolls to:
 * the left edge in a right-to-left page (M1.1 review).
 */
function reach({ box }: RenderedElement, width: number, dir: RenderedFacts['dir']): number {
  return Math.max(dir === 'rtl' ? -box.x : box.x + box.width - width, 0)
}

export const rule = defineRule({
  id: 'rtl-horizontal-overflow',
  version: '1.0.0',
  category: 'rtl',
  severity: 'serious',
  needs: ['render'],
  messages: ['element', 'page'],
  appliesTo: (_page, evidence) => renderedFacts(evidence).some(madeForPhones),
  detect: ({ rendered = [] }) => {
    const elements = new Sightings<{
      element: RenderedElement
      width: number
      dir: RenderedFacts['dir']
    }>()
    const pages = new Sightings<RenderedFacts>()
    for (const facts of rendered) {
      const width = facts.viewport.width
      // A pixel of rounding is allowed, as when measuring.
      if (!madeForPhones(facts) || facts.scrollWidth <= width + 1) continue
      if (facts.overflow.length === 0) pages.add('html', facts.engine, facts)
      for (const element of facts.overflow) {
        elements.add(element.selector, facts.engine, { element, width, dir: facts.dir })
      }
    }
    const findings: DetectorFinding<Message>[] = []
    for (const { key, engines, each } of elements) {
      const first = each.get(engines[0] ?? 'chromium')
      if (first === undefined) continue
      findings.push({
        message: 'element',
        values: {
          overflow: reach(first.element, first.width, first.dir),
          viewportWidth: first.width,
        },
        selector: key,
        engines,
        box: first.element.box,
      })
    }
    for (const { engines, each } of pages) {
      const facts = each.get(engines[0] ?? 'chromium')
      if (facts === undefined) continue
      findings.push({
        message: 'page',
        values: { scrollWidth: facts.scrollWidth, viewportWidth: facts.viewport.width },
        selector: 'html',
        engines,
      })
    }
    return findings
  },
})

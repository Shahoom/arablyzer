import type { BidiTokenFact } from '@arablyzer/collectors'
import { renderedFacts, Sightings } from '../../lib/rendered'
import { defineRule } from '../../rule'

export const rule = defineRule({
  id: 'rtl-bidi-isolation',
  version: '1.0.0',
  category: 'rtl',
  severity: 'serious',
  needs: ['render'],
  messages: ['number', 'latin'],
  appliesTo: (_page, evidence) =>
    renderedFacts(evidence).some((facts) => facts.dir === 'rtl' || facts.arabicText.length > 0),
  detect: ({ rendered = [] }) => {
    const tokens = new Sightings<BidiTokenFact>()
    for (const facts of rendered) {
      for (const token of facts.bidi)
        tokens.add(`${token.selector}\n${token.text}`, facts.engine, token)
    }
    return [...tokens].flatMap(({ engines, each }) => {
      const token = each.get(engines[0] ?? 'chromium')
      if (token === undefined) return []
      // The token goes in the snippet, which reports show left to right: inside the message,
      // right-to-left text would draw it out of order again.
      return [
        {
          message: token.kind,
          values: { text: token.text },
          selector: token.selector,
          snippet: token.text,
          engines,
          box: token.box,
          key: token.text,
        },
      ]
    })
  },
})

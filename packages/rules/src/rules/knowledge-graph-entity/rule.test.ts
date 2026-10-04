import type { KnowledgeGraphFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = evidenceOf(htmlPage('<p>نص عربي</p>'))
const withFacts = (facts: KnowledgeGraphFacts) => ({ ...page, knowledgeGraph: facts })

describe('knowledge-graph-entity', () => {
  it('is information, never deducted', () => {
    expect(rule.severity).toBe('info')
  })

  it('names the entity Google knows, in the language it was asked in', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      {
        message: 'known',
        values: {
          brand: 'متجر الواحة',
          name: 'متجر الواحة',
          lang: 'ar',
          types: 'Organization, Corporation',
          description: 'متجر إلكتروني',
          // Google gives the address as written; the collector keeps it as a URL does.
          wikipedia: new URL('https://ar.wikipedia.org/wiki/متجر_الواحة').href,
        },
        key: 'ar',
      },
    ])
  })

  it('has nothing to say of a brand Google does not know, and the page gives the name', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(evidence.knowledgeGraph).toMatchObject({ outcome: 'unknown', brand: 'متجر الواحة' })
  })

  it('applies only when Google was asked, and the page gave a name', () => {
    expect(applies(rule, page)).toBe(false)
    expect(applies(rule, withFacts({ outcome: 'no-name', brand: null, entities: [] }))).toBe(false)
    expect(applies(rule, withFacts({ outcome: 'unknown', brand: 'Acme', entities: [] }))).toBe(true)
  })
})

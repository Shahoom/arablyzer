import { describe, expect, it } from 'vitest'
import { collectKnowledgeGraph, normalizeName } from '../src/knowledge-graph'

const item = (name: string, extra: Record<string, unknown> = {}) => ({
  result: {
    '@type': ['Thing', 'Corporation', 'Organization'],
    name,
    description: 'Online retailer',
    detailedDescription: { url: 'https://en.wikipedia.org/wiki/Acme', articleBody: '…' },
    ...extra,
  },
  resultScore: 100,
})
const ok = (...items: unknown[]) => ({ status: 200, body: { itemListElement: items } })
const brand = 'Acme'

describe('collectKnowledgeGraph', () => {
  it('knows an entity of the name, with its types, description and Wikipedia article', () => {
    expect(collectKnowledgeGraph({ brand, ar: ok(), en: ok(item('Acme Inc.')) })).toEqual({
      outcome: 'known',
      brand,
      entities: [
        {
          lang: 'en',
          name: 'Acme Inc.',
          types: ['Corporation', 'Organization'],
          description: 'Online retailer',
          wikipediaUrl: 'https://en.wikipedia.org/wiki/Acme',
        },
      ],
    })
  })

  it('matches an Arabic name without marks, tatweel or spaces', () => {
    expect(normalizeName('مَتْجَـر  الواحة')).toBe(normalizeName('متجر الواحة'))
    const facts = collectKnowledgeGraph({
      brand: 'متجر الواحة',
      ar: ok(item('متجر الواحة', { description: 'متجر إلكتروني' })),
      en: ok(),
    })
    expect(facts.entities[0]).toMatchObject({ lang: 'ar', description: 'متجر إلكتروني' })
  })

  it('is unknown when the results are of other names, which Google returns as near matches', () => {
    expect(collectKnowledgeGraph({ brand, ar: ok(item('Zebra')), en: ok(item('Zeta')) })).toEqual({
      outcome: 'unknown',
      brand,
      entities: [],
    })
  })

  it('keeps only a Wikipedia address that is one, and a language that answered is enough', () => {
    const facts = collectKnowledgeGraph({
      brand,
      ar: { status: 500, body: null },
      en: ok(item('Acme', { detailedDescription: { url: 'https://evil.example/wiki/Acme' } })),
    })
    expect(facts.outcome).toBe('known')
    expect(facts.entities[0]?.wikipediaUrl).toBeNull()
  })

  it('is a failure, not a verdict, when no language answered, or the key is refused', () => {
    expect(
      collectKnowledgeGraph({
        brand,
        ar: { status: 500, body: null },
        en: { status: null, body: null },
      }).outcome,
    ).toBe('failed')
    expect(collectKnowledgeGraph({ brand, ar: { status: 403, body: {} }, en: ok() })).toMatchObject(
      { outcome: 'failed', refused: true },
    )
    expect(
      collectKnowledgeGraph({
        brand,
        ar: { status: 200, body: 'x' },
        en: { status: 200, body: 'y' },
      }).outcome,
    ).toBe('failed')
  })
})

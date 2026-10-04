import { describe, expect, it } from 'vitest'
import { htmlPage } from '../../test/helpers'
import { brandName } from './brand'

const of = (head: string) =>
  brandName(htmlPage(`<!doctype html><html lang="ar"><head>${head}</head><body></body></html>`))
const ld = (json: unknown) => `<script type="application/ld+json">${JSON.stringify(json)}</script>`

describe('brandName', () => {
  it('takes an Organization-like name first, even inside @graph, before the WebSite’s', () => {
    expect(
      of(
        ld({
          '@graph': [
            { '@type': 'WebSite', name: 'Site' },
            { '@type': 'LocalBusiness', name: 'Oasis' },
          ],
        }),
      ),
    ).toEqual({ name: 'Oasis', source: 'organization' })
    expect(of(ld({ '@type': 'WebSite', name: 'Site' }))).toEqual({
      name: 'Site',
      source: 'website',
    })
  })

  it('then og:site_name, then the first part of the title', () => {
    expect(of('<meta property="og:site_name" content="متجر الواحة"><title>x | y</title>')).toEqual({
      name: 'متجر الواحة',
      source: 'og-site-name',
    })
    expect(of('<title>متجر الواحة | قهوة عربية</title>')).toEqual({
      name: 'متجر الواحة',
      source: 'title',
    })
    expect(of('<title>Acme - Shop</title>')?.name).toBe('Acme')
  })

  it('is null for a page that gives none, and for a name that is not one', () => {
    expect(of('')).toBeNull()
    expect(of('<title>x</title>')).toBeNull()
    expect(of(`<title>${'a'.repeat(300)}</title>`)).toBeNull()
    expect(of('<script type="application/ld+json">{broken</script>')).toBeNull()
  })
})

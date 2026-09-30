import type { Lang } from './site'

export type JsonLd = Readonly<Record<string, unknown>>

/**
 * A free tool (BUILD-PLAN §6.1). No aggregateRating: Google wants one for the software rich
 * result, but it would be an invented number.
 */
export function webApplication(options: {
  readonly name: string
  readonly description: string
  readonly url: string
  readonly lang: Lang
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: options.name,
    description: options.description,
    url: options.url,
    inLanguage: options.lang,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    isAccessibleForFree: true,
    // Validators expect a currency with a price, even a price of 0.
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
  }
}

/**
 * A rule's page in the library (BUILD-PLAN §6.2): a technical article about one check, with the
 * rule's version, which changes when what it judges does.
 */
export function techArticle(options: {
  readonly headline: string
  readonly description: string
  readonly url: string
  readonly lang: Lang
  readonly version: string
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: options.headline,
    description: options.description,
    url: options.url,
    inLanguage: options.lang,
    version: options.version,
  }
}

/** A directory page (the tools', the rules'): its entries in order, each with its own page. */
export function itemList(
  items: readonly { readonly name: string; readonly url: string }[],
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  }
}

export function breadcrumbList(
  items: readonly { readonly name: string; readonly url: string }[],
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

/** "<" is written as \u003c, so the data can never end the script element or open a comment. */
export function jsonLdScript(data: JsonLd): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`
}

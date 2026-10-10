import { htmlToText } from './html'
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

/** A technical article: a rule's page in the library (BUILD-PLAN §6.2), the methodology. */
export function techArticle(options: {
  readonly headline: string
  readonly description: string
  readonly url: string
  readonly lang: Lang
  /** A rule's version, which changes when what it judges does. */
  readonly version?: string
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: options.headline,
    description: options.description,
    url: options.url,
    inLanguage: options.lang,
    ...(options.version === undefined ? {} : { version: options.version }),
  }
}

/** A glossary term's page (BUILD-PLAN §6.3): the term, defined, in the glossary's set. */
export function definedTerm(options: {
  readonly name: string
  readonly description: string
  readonly url: string
  readonly lang: Lang
  /** The term as developers write it, in English. */
  readonly termCode: string
  /** The glossary's own page. */
  readonly set: { readonly name: string; readonly url: string }
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: options.name,
    description: options.description,
    url: options.url,
    inLanguage: options.lang,
    termCode: options.termCode,
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: options.set.name, url: options.set.url },
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

/** The site's publisher: one node every other node points to by its @id. */
export function organization(options: {
  readonly name: string
  readonly url: string
  /** The site's origin: the node's @id is `${origin}/#organization`. */
  readonly origin: string
  readonly logo?: string
  readonly description?: string
  readonly sameAs?: readonly string[]
  /** The company behind it, when the brand is a product of one. */
  readonly parent?: { readonly name: string; readonly url: string }
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': organizationId(options.origin),
    name: options.name,
    url: options.url,
    ...(options.logo === undefined ? {} : { logo: options.logo }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.sameAs === undefined || options.sameAs.length === 0
      ? {}
      : { sameAs: [...options.sameAs] }),
    ...(options.parent === undefined
      ? {}
      : {
          parentOrganization: {
            '@type': 'Organization',
            name: options.parent.name,
            url: options.parent.url,
          },
        }),
  }
}

/** The @id of the site's Organization node, which a WebSite, an article and an app point to. */
export function organizationId(origin: string): string {
  return `${origin}/#organization`
}

/**
 * The site itself, once per language, with the search it really has: `searchUrl` holds
 * `{search_term_string}` (the knowledge hub reads ?q=). No SearchAction without a search.
 */
export function webSite(options: {
  readonly name: string
  readonly url: string
  readonly origin: string
  readonly lang: Lang
  readonly description: string
  readonly searchUrl?: string
}): JsonLd {
  if (options.searchUrl !== undefined && !options.searchUrl.includes('{search_term_string}')) {
    throw new TypeError('A search URL names {search_term_string} where the query goes')
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${options.url}#website`,
    name: options.name,
    url: options.url,
    inLanguage: options.lang,
    description: options.description,
    publisher: { '@id': organizationId(options.origin) },
    ...(options.searchUrl === undefined
      ? {}
      : {
          potentialAction: {
            '@type': 'SearchAction',
            target: { '@type': 'EntryPoint', urlTemplate: options.searchUrl },
            'query-input': 'required name=search_term_string',
          },
        }),
  }
}

/**
 * The product, as a free web application. Like webApplication() it has no aggregateRating: the
 * rich result asks for one, but it would be an invented number.
 */
export function softwareApplication(options: {
  readonly name: string
  readonly description: string
  readonly url: string
  readonly origin: string
  readonly lang: Lang
  readonly featureList?: readonly string[]
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${options.origin}/#software`,
    name: options.name,
    description: options.description,
    url: options.url,
    inLanguage: options.lang,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
    publisher: { '@id': organizationId(options.origin) },
    ...(options.featureList === undefined || options.featureList.length === 0
      ? {}
      : { featureList: [...options.featureList] }),
  }
}

/**
 * Questions a page shows, with the answers it shows: Google asks that the markup match the text
 * on the page, so a caller passes the page's own entries. Plain text, as the schema asks.
 */
export function faqPage(
  entries: readonly { readonly question: string; readonly answer: string }[],
): JsonLd {
  if (entries.length === 0) throw new TypeError('A FAQPage has at least one question')
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: htmlToText(entry.question),
      acceptedAnswer: { '@type': 'Answer', text: htmlToText(entry.answer) },
    })),
  }
}

/** An article of the blog: a BlogPosting with its author, dates, image and publisher. */
export function blogPosting(options: {
  readonly headline: string
  readonly description: string
  readonly url: string
  readonly origin: string
  readonly lang: Lang
  /** YYYY-MM-DD. */
  readonly published: string
  /** YYYY-MM-DD; the publication date when the article was never changed. */
  readonly modified: string
  readonly author: string
  readonly image: string
  readonly keywords: readonly string[]
  readonly wordCount: number
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: options.headline,
    description: options.description,
    url: options.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': options.url },
    inLanguage: options.lang,
    datePublished: options.published,
    dateModified: options.modified,
    author: { '@type': 'Organization', name: options.author, url: options.origin },
    // In full, not by reference alone: the Organization node is on the home page, and a page's
    // markup is read by itself.
    publisher: {
      '@type': 'Organization',
      '@id': organizationId(options.origin),
      name: 'Arablyzer',
      url: `${options.origin}/`,
      logo: { '@type': 'ImageObject', url: `${options.origin}/favicon.svg` },
    },
    image: [options.image],
    keywords: options.keywords.join(', '),
    wordCount: options.wordCount,
  }
}

/**
 * Two or more things set side by side (a comparison page): an ItemList whose items are
 * applications, each with its name and page. Offers only where the caller knows the price.
 */
export function applicationList(
  items: readonly {
    readonly name: string
    readonly url: string
    readonly description: string
    readonly free?: boolean
  }[],
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'SoftwareApplication',
        name: item.name,
        url: item.url,
        description: item.description,
        applicationCategory: 'DeveloperApplication',
        ...(item.free === true
          ? { offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' } }
          : {}),
      },
    })),
  }
}

/** "<" is written as \u003c, so the data can never end the script element or open a comment. */
export function jsonLdScript(data: JsonLd): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`
}

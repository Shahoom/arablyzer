import type { GlossaryTermDefinition } from './glossary'
import { definition as aiCrawlers } from './glossary/ai-crawlers/term'
import { definition as altText } from './glossary/alt-text/term'
import { definition as bidi } from './glossary/bidi/term'
import { definition as canonicalUrl } from './glossary/canonical-url/term'
import { definition as cls } from './glossary/cls/term'
import { definition as coreWebVitals } from './glossary/core-web-vitals/term'
import { definition as crawling } from './glossary/crawling/term'
import { definition as crux } from './glossary/crux/term'
import { definition as cssLogicalProperties } from './glossary/css-logical-properties/term'
import { definition as easternArabicNumerals } from './glossary/eastern-arabic-numerals/term'
import { definition as fontFallback } from './glossary/font-fallback/term'
import { definition as googlebot } from './glossary/googlebot/term'
import { definition as h1Heading } from './glossary/h1-heading/term'
import { definition as hreflang } from './glossary/hreflang/term'
import { definition as hsts } from './glossary/hsts/term'
import { definition as httpRedirect } from './glossary/http-redirect/term'
import { definition as httpStatusCode } from './glossary/http-status-code/term'
import { definition as https } from './glossary/https/term'
import { definition as indexing } from './glossary/indexing/term'
import { definition as inp } from './glossary/inp/term'
import { definition as jsonLd } from './glossary/json-ld/term'
import { definition as langAttribute } from './glossary/lang-attribute/term'
import { definition as lcp } from './glossary/lcp/term'
import { definition as letterSpacing } from './glossary/letter-spacing/term'
import { definition as metaDescription } from './glossary/meta-description/term'
import { definition as mixedContent } from './glossary/mixed-content/term'
import { definition as mojibake } from './glossary/mojibake/term'
import { definition as noindex } from './glossary/noindex/term'
import { definition as openGraph } from './glossary/open-graph/term'
import { definition as robotsTxt } from './glossary/robots-txt/term'
import { definition as rtl } from './glossary/rtl/term'
import { definition as soft404 } from './glossary/soft-404/term'
import { definition as structuredData } from './glossary/structured-data/term'
import { definition as tatweel } from './glossary/tatweel/term'
import { definition as titleTag } from './glossary/title-tag/term'
import { definition as wcag } from './glossary/wcag/term'
import { definition as webFontSubsetting } from './glossary/web-font-subsetting/term'
import { definition as xmlSitemap } from './glossary/xml-sitemap/term'

/** Every glossary term, sorted by slug, without its copy. */
export const GLOSSARY_DEFINITIONS: readonly GlossaryTermDefinition[] = [
  aiCrawlers,
  altText,
  bidi,
  canonicalUrl,
  cls,
  coreWebVitals,
  crawling,
  crux,
  cssLogicalProperties,
  easternArabicNumerals,
  fontFallback,
  googlebot,
  h1Heading,
  hreflang,
  hsts,
  httpRedirect,
  httpStatusCode,
  https,
  indexing,
  inp,
  jsonLd,
  langAttribute,
  lcp,
  letterSpacing,
  metaDescription,
  mixedContent,
  mojibake,
  noindex,
  openGraph,
  robotsTxt,
  rtl,
  soft404,
  structuredData,
  tatweel,
  titleTag,
  wcag,
  webFontSubsetting,
  xmlSitemap,
]

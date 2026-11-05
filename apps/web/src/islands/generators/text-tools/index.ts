import { spec as arabicSlugGenerator } from './arabic-slug-generator'
import { spec as errorDecoder } from './error-decoder'
import { spec as metaTagGenerator } from './meta-tag-generator'
import { generator as redirectGenerator, planner as redirectPlanner } from './redirects'
import { spec as robotsGenerator } from './robots-generator'
import { spec as serpPreview } from './serp-preview'
import { spec as sitemapDiff } from './sitemap-diff'
import { spec as sitemapGenerator } from './sitemap-generator'
import type { TextToolSpec } from './spec'
import { spec as titleFixer } from './title-fixer'

/** The tools whose page mounts TextTool, by slug. */
export const TEXT_TOOLS: Readonly<Record<string, TextToolSpec | undefined>> = {
  'arabic-slug-generator': arabicSlugGenerator,
  'error-decoder': errorDecoder,
  'meta-tag-generator': metaTagGenerator,
  'redirect-generator': redirectGenerator,
  'redirect-planner': redirectPlanner,
  'robots-generator': robotsGenerator,
  'serp-preview': serpPreview,
  'sitemap-diff': sitemapDiff,
  'sitemap-generator': sitemapGenerator,
  'title-fixer': titleFixer,
}

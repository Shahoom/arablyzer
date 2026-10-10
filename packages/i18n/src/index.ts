export { codeParts, type Copy, type Lang } from './copy'
export { ALERT_TEXT, type AlertStrings } from './alerts'
export { ACCOUNT_UI, type AccountProblem, type AccountStrings } from './account'
export { BLOG_TAGS, BLOG_UI, type BlogStrings, type BlogTag } from './blog'
export { COMPARE_UI, type CompareStrings } from './compare'
export { CRAWL_UI, type CrawlStrings } from './crawl'
export { PDF_UI, type PdfStrings } from './pdf'
export { GENERATORS_UI, type GeneratorsStrings } from './generators'
export { GUIDES_UI, type GuidesStrings } from './guides'
export { HERO_TOOLS, HOME, type HeroTool, type HomeStrings } from './home'
export { KNOWLEDGE_UI, type KnowledgeStrings, type KnowledgeType } from './knowledge'
export { arabicCount, englishCount, englishForm, type ArabicForms } from './plural'
export {
  CATEGORIES,
  REPORT,
  type CategoryName,
  type EngineState,
  type ReportStrings,
} from './report'
export { PAGES_UI, type BotNumbers, type PagesStrings } from './pages'
export { RULES_UI, type RuleReads, type RulesStrings } from './rules'
export { SCAN_FORM, type FormProblem, type ScanFormStrings } from './scan-form'
export { SITE, type SiteStrings } from './site'
export { TOOL_APP, type ToolAppStrings } from './tool-app'
export { TOOLS_UI, type ToolCategoryName, type ToolsStrings, type ToolTag } from './tools'
export {
  VERSUS_SLUGS,
  VERSUS_UI,
  type Mark,
  type VersusCell,
  type VersusPage,
  type VersusSlug,
  type VersusStrings,
} from './versus'

import { ACCOUNT_UI } from './account'
import { ALERT_TEXT } from './alerts'
import { BLOG_UI } from './blog'
import { COMPARE_UI } from './compare'
import { CRAWL_UI } from './crawl'
import { PDF_UI } from './pdf'
import type { Copy } from './copy'
import { GENERATORS_UI } from './generators'
import { GUIDES_UI } from './guides'
import { HOME } from './home'
import { KNOWLEDGE_UI } from './knowledge'
import { PAGES_UI } from './pages'
import { REPORT } from './report'
import { RULES_UI } from './rules'
import { SCAN_FORM } from './scan-form'
import { SITE } from './site'
import { TOOL_APP } from './tool-app'
import { TOOLS_UI } from './tools'
import { VERSUS_UI } from './versus'

/** Every set of interface copy, by the file it lives in, for the review check. */
export const ALL_COPY: Readonly<Record<string, Copy<unknown>>> = {
  'site.ts': SITE,
  'home.ts': HOME,
  'scan-form.ts': SCAN_FORM,
  'report.ts': REPORT,
  'tools.ts': TOOLS_UI,
  'generators.ts': GENERATORS_UI,
  'rules.ts': RULES_UI,
  'pages.ts': PAGES_UI,
  'guides.ts': GUIDES_UI,
  'knowledge.ts': KNOWLEDGE_UI,
  'tool-app.ts': TOOL_APP,
  'account.ts': ACCOUNT_UI,
  'alerts.ts': ALERT_TEXT,
  'crawl.ts': CRAWL_UI,
  'compare.ts': COMPARE_UI,
  'blog.ts': BLOG_UI,
  'versus.ts': VERSUS_UI,
  'pdf.ts': PDF_UI,
}

export { codeParts, type Copy, type Lang } from './copy'
export { HOME, TOPICS, type HomeStrings, type Topic } from './home'
export { arabicCount, englishCount, type ArabicForms } from './plural'
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
export { TOOLS_UI, type ToolCategoryName, type ToolsStrings, type ToolTag } from './tools'

import type { Copy } from './copy'
import { HOME } from './home'
import { PAGES_UI } from './pages'
import { REPORT } from './report'
import { RULES_UI } from './rules'
import { SCAN_FORM } from './scan-form'
import { SITE } from './site'
import { TOOLS_UI } from './tools'

/** Every set of interface copy, by the file it lives in, for the review check. */
export const ALL_COPY: Readonly<Record<string, Copy<unknown>>> = {
  'site.ts': SITE,
  'home.ts': HOME,
  'scan-form.ts': SCAN_FORM,
  'report.ts': REPORT,
  'tools.ts': TOOLS_UI,
  'rules.ts': RULES_UI,
  'pages.ts': PAGES_UI,
}

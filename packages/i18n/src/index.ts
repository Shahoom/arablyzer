export { codeParts, type Copy, type Lang } from './copy'
export { HOME, TOPICS, type HomeStrings, type Topic } from './home'
export { arabicCount, englishCount, englishForm, type ArabicForms } from './plural'
export {
  CATEGORIES,
  REPORT,
  type CategoryName,
  type EngineState,
  type ReportStrings,
} from './report'
export { SCAN_FORM, type FormProblem, type ScanFormStrings } from './scan-form'
export { SITE, type SiteStrings } from './site'
export { TOOL_APP, type ToolAppStrings } from './tool-app'
export { TOOLS_UI, type ToolCategoryName, type ToolsStrings, type ToolTag } from './tools'

import type { Copy } from './copy'
import { HOME } from './home'
import { REPORT } from './report'
import { SCAN_FORM } from './scan-form'
import { SITE } from './site'
import { TOOL_APP } from './tool-app'
import { TOOLS_UI } from './tools'

/** Every set of interface copy, by the file it lives in, for the review check. */
export const ALL_COPY: Readonly<Record<string, Copy<unknown>>> = {
  'site.ts': SITE,
  'home.ts': HOME,
  'scan-form.ts': SCAN_FORM,
  'report.ts': REPORT,
  'tools.ts': TOOLS_UI,
  'tool-app.ts': TOOL_APP,
}

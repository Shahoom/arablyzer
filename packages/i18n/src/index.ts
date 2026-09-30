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
export { SCAN_FORM, type FormProblem, type ScanFormStrings } from './scan-form'
export { SITE, type SiteStrings } from './site'

import type { Copy } from './copy'
import { HOME } from './home'
import { REPORT } from './report'
import { SCAN_FORM } from './scan-form'
import { SITE } from './site'

/** Every set of interface copy, by the file it lives in, for the review check. */
export const ALL_COPY: Readonly<Record<string, Copy<unknown>>> = {
  'site.ts': SITE,
  'home.ts': HOME,
  'scan-form.ts': SCAN_FORM,
  'report.ts': REPORT,
}

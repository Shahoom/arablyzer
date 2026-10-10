import {
  brandOf,
  crawlComparisonDocument,
  crawlDocument,
  MAX_DOCUMENT_BYTES,
  pageDocument,
  scanComparisonDocument,
  type BrandInput,
  type PdfDocument,
} from '@arablyzer/pdf'
import type { PlanCatalog } from '@arablyzer/plans'
import type { CrawlData, PdfData, PdfJob, ScanStore } from '@arablyzer/store'
import { planOf } from '../accounts'
import { compareCrawls } from '../compare/crawls'
import { compareScans, isComparable } from '../compare/scans'
import { reportOf } from '../crawls'

export interface DocumentDeps {
  readonly pdfs: PdfData
  readonly crawls: CrawlData
  readonly store: ScanStore
  readonly plans: PlanCatalog
  readonly now: () => Date
}

/** The job's report is gone, or is not what it was when the PDF was asked for. */
export class SubjectGone extends Error {}

/**
 * The brand the account's PDFs carry: its own name, colour and logo when the plan has white-label
 * and a name is set; nothing (Arablyzer's own mark) otherwise.
 */
export async function brandInputOf(
  deps: Pick<DocumentDeps, 'pdfs' | 'plans'>,
  userId: string,
): Promise<BrandInput | null> {
  const plan = planOf(deps.plans, userId)
  if (!plan.whiteLabel) return null
  const brand = await deps.pdfs.brand(userId)
  if (brand === null || brand.name.trim() === '') return null
  const logo = brand.logoType === null ? null : await deps.pdfs.logo(userId)
  return { name: brand.name, color: brand.color, logo, credit: plan.whiteLabelCredit }
}

/** The document a job draws, from the report as it is now. */
export async function documentOf(deps: DocumentDeps, job: PdfJob): Promise<PdfDocument> {
  const lang = job.language
  const generatedAt = deps.now()
  const brand = brandOf(await brandInputOf(deps, job.userId), lang)
  const frame = { lang, brand, generatedAt }
  let document: PdfDocument
  switch (job.kind) {
    case 'scan': {
      const scan = await deps.store.get(job.subject)
      if (!isComparable(scan)) throw new SubjectGone('The scan has no report')
      document = pageDocument({ report: scan.report, ...frame })
      break
    }
    case 'compare-scans': {
      const [base, head] = await Promise.all([
        deps.store.get(job.base ?? ''),
        deps.store.get(job.subject),
      ])
      if (!isComparable(base) || !isComparable(head)) throw new SubjectGone('A scan has no report')
      document = scanComparisonDocument({ comparison: compareScans(base, head), ...frame })
      break
    }
    case 'crawl': {
      const crawl = await deps.crawls.get(job.subject)
      if (crawl?.userId !== job.userId) throw new SubjectGone('The crawl is gone')
      document = crawlDocument({ report: await reportOf(crawl, deps.crawls, deps.store), ...frame })
      break
    }
    case 'compare-crawls': {
      const [base, head] = await Promise.all([
        deps.crawls.get(job.base ?? ''),
        deps.crawls.get(job.subject),
      ])
      if (base?.userId !== job.userId || head?.userId !== job.userId) {
        throw new SubjectGone('A crawl is gone')
      }
      const [was, is] = await Promise.all([
        reportOf(base, deps.crawls, deps.store),
        reportOf(head, deps.crawls, deps.store),
      ])
      document = crawlComparisonDocument({ comparison: compareCrawls(was, is), ...frame })
      break
    }
  }
  // The scanner takes no more than MAX_DOCUMENT_BYTES: the pictures go first, then the findings' tail.
  if (JSON.stringify(document).length > MAX_DOCUMENT_BYTES) {
    document = {
      ...document,
      sections: document.sections.map((section) => ({
        ...section,
        blocks: section.blocks.filter((block) => block.t !== 'image'),
      })),
    }
  }
  return document
}

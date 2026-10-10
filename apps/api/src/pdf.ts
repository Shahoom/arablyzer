import {
  BRAND_LOGO_PATH,
  BRAND_PATH,
  BrandPatch,
  NOT_COMPARABLE,
  PDF_ID_PATTERN,
  PDF_PATH,
  PdfRequest,
  SCAN_ID_PATTERN,
  type BrandSettings,
  type LogoType,
  type PdfsResponse,
  type PdfSummary,
  type ReportBrand,
} from '@arablyzer/api-contract'
import { brandColorOf, checkLogo, logoTypeOf } from '@arablyzer/pdf'
import {
  quietly,
  type CrawlData,
  type PdfData,
  type PdfJob,
  type ScanStore,
} from '@arablyzer/store'
import type { Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { planOf, type AccountsDeps, type SessionAccess } from './accounts'
import { comparableCrawls, comparableScans } from './compare'
import { fromTheSite } from './guards'
import { newPdfId } from './ids'
import { isComparable } from './compare/scans'

export interface PdfDeps {
  readonly access: SessionAccess
  readonly accounts: AccountsDeps
  readonly pdfs: PdfData
  readonly crawls: CrawlData | undefined
  readonly store: ScanStore
  readonly origin: string | undefined
  readonly log: ((message: string) => void) | undefined
  readonly now: () => Date
}

/** The PDFs a list shows. */
const LIST_LIMIT = 20
/** A request for a PDF is a few ids: 2 KB is ample. */
const MAX_BODY_BYTES = 2 * 1024
/** A logo upload: the file may carry metadata that is taken out, so more than the 200 KB that is kept. */
const MAX_LOGO_UPLOAD = 800 * 1024

/** A PDF as the page reads it: its state, and how long the file is kept. */
export function pdfSummary(job: PdfJob): PdfSummary {
  return {
    id: job.id,
    kind: job.kind,
    subject: job.subject,
    base: job.base,
    language: job.language,
    state: job.state,
    error: job.error,
    bytes: job.bytes,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  }
}

/** The file name a download is saved as: ASCII, with the kind and the start of the report's id. */
const fileNameOf = (job: PdfJob): string =>
  `arablyzer-${job.kind}-${job.subject.slice(0, 8).replace(/[^A-Za-z0-9]/g, '')}.pdf`

/**
 * PDF export (M4.7): asking for a PDF of a report, polling it, downloading and deleting it; and the
 * account's brand (white-label). Behind the session and the same Origin guard as the other account
 * routes; a report or PDF that is not the caller's is a 404 as one that does not exist is. The
 * rendering is not here: a request only queues it, and the PDF job (apps/api/src/pdf/main.ts) draws it.
 */
export function mountPdf(app: Hono, deps: PdfDeps): void {
  const { access, pdfs } = deps
  const told = quietly('PDF', deps.log)
  const json = fromTheSite({
    origin: deps.origin,
    json: true,
    refuse: (c) => access.fail(c, 'bad-request'),
    foreign: told,
  })
  const plain = fromTheSite({
    origin: deps.origin,
    json: false,
    refuse: (c) => access.fail(c, 'bad-request'),
    foreign: told,
  })

  /** The month's allowance, for the page. */
  async function allowance(userId: string): Promise<PdfsResponse['allowance']> {
    return {
      perMonth: planOf(access.plans, userId).pdfPerMonth,
      used: await pdfs.used(userId, deps.now()),
    }
  }

  async function owned(c: Context, userId: string): Promise<PdfJob | null> {
    const id = c.req.param('id') ?? ''
    if (!PDF_ID_PATTERN.test(id)) return null
    const job = await pdfs.get(id)
    return job?.userId === userId ? job : null
  }

  app.post(
    PDF_PATH,
    json,
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => access.fail(c, 'bad-request') }),
    async (c) => {
      const read = await access.require(c)
      if (read instanceof Response) return read
      let raw: unknown
      try {
        raw = await c.req.json()
      } catch {
        return access.fail(c, 'bad-request')
      }
      const request = PdfRequest.safeParse(raw)
      if (!request.success) return access.fail(c, 'bad-request')
      const userId = read.user.id
      const asked = request.data
      // The report must be the caller's, and one that can be drawn: a whole-page scan with a
      // report, a finished crawl, or two of one site.
      let subject: string
      let base: string | null = null
      if (asked.kind === 'scan') {
        const linked = await access.data.linkedScans(userId, [asked.id])
        const scan = linked.has(asked.id) ? await deps.store.get(asked.id) : null
        if (scan === null) return access.fail(c, 'not-found')
        if (!isComparable(scan)) return c.json({ error: NOT_COMPARABLE }, 422)
        subject = asked.id
      } else if (asked.kind === 'compare-scans') {
        const pair = await comparableScans(access, deps.store, userId, asked.base, asked.head)
        if (pair === 'not-found') return access.fail(c, 'not-found')
        if (pair === 'not-comparable') return c.json({ error: NOT_COMPARABLE }, 422)
        subject = asked.head
        base = asked.base
      } else if (deps.crawls === undefined) {
        return access.fail(c, 'not-found')
      } else if (asked.kind === 'crawl') {
        const crawl = await deps.crawls.get(asked.id)
        if (crawl?.userId !== userId || crawl.state !== 'done') return access.fail(c, 'not-found')
        subject = asked.id
      } else {
        const pair = await comparableCrawls(deps.crawls, userId, asked.base, asked.head)
        if (pair === 'not-found') return access.fail(c, 'not-found')
        if (pair === 'not-comparable') return c.json({ error: NOT_COMPARABLE }, 422)
        subject = asked.head
        base = asked.base
      }
      const plan = planOf(access.plans, userId)
      const created = await pdfs.create(
        {
          id: newPdfId(),
          userId,
          kind: asked.kind,
          subject,
          base,
          language: asked.language,
          createdAt: deps.now(),
        },
        plan.pdfPerMonth,
      )
      if (created.kind === 'active') return access.fail(c, 'conflict')
      if (created.kind === 'limit') {
        return c.json({ error: 'plan-limit', limit: 'pdfPerMonth', plan: plan.id }, 403)
      }
      return c.json(pdfSummary(created.job), 202)
    },
  )

  app.get(PDF_PATH, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const body: PdfsResponse = {
      pdfs: (await pdfs.list(read.user.id, LIST_LIMIT)).map(pdfSummary),
      allowance: await allowance(read.user.id),
    }
    return c.json(body)
  })

  app.get('/api/pdf/:id', async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const job = await owned(c, read.user.id)
    if (job === null) return access.fail(c, 'not-found')
    return c.json(pdfSummary(job))
  })

  app.get('/api/pdf/:id/file', async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const job = await owned(c, read.user.id)
    const file = job === null ? null : await pdfs.file(job.id)
    if (job === null || file === null) return access.fail(c, 'not-found')
    return c.body(Buffer.from(file), 200, {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${fileNameOf(job)}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': 'sandbox',
    })
  })

  app.delete('/api/pdf/:id', plain, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const job = await owned(c, read.user.id)
    if (job === null || !(await pdfs.remove(read.user.id, job.id))) {
      return access.fail(c, job === null ? 'not-found' : 'conflict')
    }
    return c.body(null, 204)
  })

  // The brand ----------------------------------------------------------------------------------------

  async function settingsOf(userId: string): Promise<BrandSettings> {
    const plan = planOf(access.plans, userId)
    const brand = await pdfs.brand(userId)
    const guarded = brandColorOf(brand?.color ?? null)
    return {
      available: plan.whiteLabel,
      name: brand?.name ?? '',
      color: brand?.color ?? null,
      hasLogo: brand?.logoType != null,
      logoType: brand?.logoType ?? null,
      credit: plan.whiteLabelCredit,
      colorFallback: guarded.fallback,
      updatedAt: brand?.updatedAt.toISOString() ?? null,
    }
  }

  app.get(BRAND_PATH, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    return c.json(await settingsOf(read.user.id))
  })

  app.put(
    BRAND_PATH,
    json,
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => access.fail(c, 'bad-request') }),
    async (c) => {
      const read = await access.require(c)
      if (read instanceof Response) return read
      const plan = planOf(access.plans, read.user.id)
      if (!plan.whiteLabel) {
        return c.json({ error: 'plan-limit', limit: 'whiteLabel', plan: plan.id }, 403)
      }
      let raw: unknown
      try {
        raw = await c.req.json()
      } catch {
        return access.fail(c, 'bad-request')
      }
      const patch = BrandPatch.safeParse(raw)
      if (!patch.success) return access.fail(c, 'bad-request')
      // A name is text: no control characters, no line breaks, trimmed and kept to 60 characters.
      const name = patch.data.name
        .replace(/[\p{Cc}\p{Cf}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
      await pdfs.setBrand(
        read.user.id,
        { name, color: patch.data.color === null ? null : patch.data.color.toLowerCase() },
        deps.now(),
      )
      return c.json(await settingsOf(read.user.id))
    },
  )

  app.put(
    BRAND_LOGO_PATH,
    plain,
    bodyLimit({
      maxSize: MAX_LOGO_UPLOAD,
      onError: (c) => c.json({ error: 'bad-request', logo: 'too-large' }, 400),
    }),
    async (c) => {
      const read = await access.require(c)
      if (read instanceof Response) return read
      const plan = planOf(access.plans, read.user.id)
      if (!plan.whiteLabel) {
        return c.json({ error: 'plan-limit', limit: 'whiteLabel', plan: plan.id }, 403)
      }
      const bytes = new Uint8Array(await c.req.arrayBuffer())
      // What the file is comes from its bytes alone; the type the browser sent is not looked at.
      const checked = checkLogo(bytes)
      if (!checked.ok) return c.json({ error: 'bad-request', logo: checked.problem }, 400)
      await pdfs.setLogo(read.user.id, { type: checked.type, bytes: checked.bytes }, deps.now())
      return c.json(await settingsOf(read.user.id))
    },
  )

  app.delete(BRAND_LOGO_PATH, plain, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    await pdfs.setLogo(read.user.id, null, deps.now())
    return c.json(await settingsOf(read.user.id))
  })

  app.get(BRAND_LOGO_PATH, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const logo = await pdfs.logo(read.user.id)
    return logo === null ? access.fail(c, 'not-found') : logoResponse(c, logo)
  })

  // The brand of a shared report (public): the name, colour and logo of the account that keeps the
  // scan, when its plan has white-label. It shows nothing else of the account, and nothing of a scan
  // no account keeps.
  async function brandOfReport(scanId: string): Promise<{
    brand: ReportBrand
    logo: { type: LogoType } | null
    owner: string
  } | null> {
    if (!SCAN_ID_PATTERN.test(scanId)) return null
    const owner = await access.data.ownerOf(scanId)
    if (owner === null) return null
    const plan = planOf(access.plans, owner)
    if (!plan.whiteLabel) return null
    const brand = await pdfs.brand(owner)
    if (brand === null || brand.name === '') return null
    return {
      brand: {
        name: brand.name,
        color: brandColorOf(brand.color).color,
        hasLogo: brand.logoType !== null,
        credit: plan.whiteLabelCredit,
      },
      logo: brand.logoType === null ? null : { type: brand.logoType },
      owner,
    }
  }

  app.get('/api/reports/:id/brand', async (c) => {
    const found = await brandOfReport(c.req.param('id'))
    if (found === null) return c.json({ error: 'not-found' }, 404, { 'cache-control': 'no-store' })
    return c.json(found.brand, 200, { 'cache-control': 'no-store' })
  })

  app.get('/api/reports/:id/brand/logo', async (c) => {
    const found = await brandOfReport(c.req.param('id'))
    const logo = found?.logo == null ? null : await pdfs.logo(found.owner)
    if (logo === null) return c.json({ error: 'not-found' }, 404, { 'cache-control': 'no-store' })
    return logoResponse(c, logo)
  })
}

/** A logo as an image: the type it was stored under, and nothing that would let it run as a page. */
function logoResponse(
  c: Context,
  logo: { readonly type: LogoType; readonly bytes: Uint8Array },
): Response {
  // Belt and braces: what is stored was checked by its bytes, and is checked again on the way out.
  if (logoTypeOf(logo.bytes) !== logo.type) return c.json({ error: 'not-found' }, 404)
  return c.body(Buffer.from(logo.bytes), 200, {
    'content-type': logo.type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cross-origin-resource-policy': 'same-origin',
  })
}

import {
  BRAND_LOGO_PATH,
  BRAND_PATH,
  PDF_PATH,
  pdfPath,
  type BrandSettings,
  type PdfsResponse,
  type PdfSummary,
} from '@arablyzer/api-contract/codes'
import { problemOf } from './auth-model'
import {
  isBrandSettings,
  isLogoProblem,
  isPdfsResponse,
  isPdfSummary,
  pdfProblemOf,
  requestOf,
  type PdfAsk,
  type PdfProblem,
} from './pdf-model'
import { jsonOf, request, type SiteOutcome } from './sites-api'

/** The page's requests about PDFs and the brand (M4.7), on the same origin with the session cookie. */
export type PdfOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: PdfProblem; readonly logo?: string }

async function read<T>(
  response: Response | null,
  accept: (value: unknown) => value is T,
): Promise<PdfOutcome<T>> {
  if (response === null) return { ok: false, problem: 'network' }
  const body = await jsonOf(response)
  if (!response.ok) {
    const logo = isObject(body) && isLogoProblem(body.logo) ? body.logo : undefined
    const code = isObject(body) && body.error === 'not-comparable' ? 'not-comparable' : null
    return {
      ok: false,
      problem: pdfProblemOf(code ?? problemOf(response.status, body).problem),
      ...(logo === undefined ? {} : { logo }),
    }
  }
  return accept(body) ? { ok: true, value: body } : { ok: false, problem: 'unavailable' }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export function askPdf(
  ask: PdfAsk,
  language: 'ar' | 'en',
  send: typeof fetch = fetch,
): Promise<PdfOutcome<PdfSummary>> {
  return request(send, 'POST', PDF_PATH, requestOf(ask, language)).then((r) =>
    read(r, isPdfSummary),
  )
}

export function getPdf(id: string, send: typeof fetch = fetch): Promise<PdfOutcome<PdfSummary>> {
  return request(send, 'GET', pdfPath(id)).then((r) => read(r, isPdfSummary))
}

export function listPdfs(send: typeof fetch = fetch): Promise<PdfOutcome<PdfsResponse>> {
  return request(send, 'GET', PDF_PATH).then((r) => read(r, isPdfsResponse))
}

export async function deletePdf(id: string, send: typeof fetch = fetch): Promise<PdfOutcome<null>> {
  const response = await request(send, 'DELETE', pdfPath(id))
  if (response === null) return { ok: false, problem: 'network' }
  if (response.ok) return { ok: true, value: null }
  return {
    ok: false,
    problem: pdfProblemOf(problemOf(response.status, await jsonOf(response)).problem),
  }
}

export function getBrand(send: typeof fetch = fetch): Promise<PdfOutcome<BrandSettings>> {
  return request(send, 'GET', BRAND_PATH).then((r) => read(r, isBrandSettings))
}

export function saveBrand(
  brand: { readonly name: string; readonly color: string | null },
  send: typeof fetch = fetch,
): Promise<PdfOutcome<BrandSettings>> {
  return request(send, 'PUT', BRAND_PATH, brand).then((r) => read(r, isBrandSettings))
}

/** Sends the logo's bytes as they are: the API reads the type from them, not from what is said here. */
export async function uploadLogo(
  file: Blob,
  send: typeof fetch = fetch,
): Promise<PdfOutcome<BrandSettings>> {
  try {
    const response = await send(BRAND_LOGO_PATH, {
      method: 'PUT',
      credentials: 'same-origin',
      referrerPolicy: 'no-referrer',
      headers: { accept: 'application/json', 'content-type': 'application/octet-stream' },
      body: file,
    })
    return await read(response, isBrandSettings)
  } catch {
    return { ok: false, problem: 'network' }
  }
}

export function removeLogo(send: typeof fetch = fetch): Promise<PdfOutcome<BrandSettings>> {
  return request(send, 'DELETE', BRAND_LOGO_PATH).then((r) => read(r, isBrandSettings))
}

export type { SiteOutcome }

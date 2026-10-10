import {
  BRAND_LOGO_PATH,
  LOGO_PROBLEMS,
  PDF_KINDS,
  PDF_STATES,
  type BrandSettings,
  type LogoProblem,
  type PdfKind,
  type PdfsResponse,
  type PdfSummary,
  type ReportBrand,
} from '@arablyzer/api-contract/codes'
import type { PdfRequest } from '@arablyzer/api-contract'
import type { AuthProblem } from './auth-model'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const isText = (value: unknown): value is string => typeof value === 'string'
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

export function isPdfSummary(value: unknown): value is PdfSummary {
  if (!isObject(value)) return false
  return (
    isText(value.id) &&
    isText(value.kind) &&
    (PDF_KINDS as readonly string[]).includes(value.kind) &&
    isText(value.subject) &&
    (value.base === null || isText(value.base)) &&
    (value.language === 'ar' || value.language === 'en') &&
    isText(value.state) &&
    (PDF_STATES as readonly string[]).includes(value.state) &&
    (value.error === null || isText(value.error)) &&
    (value.bytes === null || isCount(value.bytes)) &&
    isText(value.createdAt) &&
    (value.finishedAt === null || isText(value.finishedAt))
  )
}

export function isPdfsResponse(value: unknown): value is PdfsResponse {
  if (!isObject(value) || !Array.isArray(value.pdfs) || !isObject(value.allowance)) return false
  return (
    (value.pdfs as unknown[]).every(isPdfSummary) &&
    isCount(value.allowance.perMonth) &&
    isCount(value.allowance.used)
  )
}

export function isBrandSettings(value: unknown): value is BrandSettings {
  if (!isObject(value)) return false
  return (
    typeof value.available === 'boolean' &&
    isText(value.name) &&
    (value.color === null || (isText(value.color) && /^#[0-9a-f]{6}$/i.test(value.color))) &&
    typeof value.hasLogo === 'boolean' &&
    (value.logoType === null || isText(value.logoType)) &&
    typeof value.credit === 'boolean' &&
    typeof value.colorFallback === 'boolean' &&
    (value.updatedAt === null || isText(value.updatedAt))
  )
}

export function isReportBrand(value: unknown): value is ReportBrand {
  if (!isObject(value)) return false
  return (
    isText(value.name) &&
    value.name !== '' &&
    (value.color === null || (isText(value.color) && /^#[0-9a-f]{6}$/i.test(value.color))) &&
    typeof value.hasLogo === 'boolean' &&
    typeof value.credit === 'boolean'
  )
}

/** A PDF still being made. */
export const isMaking = (pdf: PdfSummary): boolean =>
  pdf.state === 'queued' || pdf.state === 'running'

/** How often a PDF being made is looked at. */
export const PDF_POLL_MS = 2_500
/** How long a PDF is waited for on a page before it says it is taking long. */
export const PDF_WAIT_MS = 4 * 60_000

/** The problems the PDF buttons word: the account codes, narrowed to the ones that can happen here. */
export type PdfProblem =
  | 'network'
  | 'unavailable'
  | 'unauthorized'
  | 'not-found'
  | 'conflict'
  | 'plan-limit'
  | 'bad-request'
  | 'rate-limited'

export function pdfProblemOf(problem: AuthProblem | 'not-comparable'): PdfProblem {
  switch (problem) {
    case 'network':
    case 'unavailable':
    case 'unauthorized':
    case 'not-found':
    case 'conflict':
    case 'plan-limit':
    case 'bad-request':
    case 'rate-limited':
      return problem
    case 'not-comparable':
      return 'not-found'
    default:
      return 'unavailable'
  }
}

/** The address a finished PDF is downloaded from. */
export const pdfFileHref = (id: string): string => `/api/pdf/${id}/file`

/** The request for a PDF of what a button stands for. */
export type PdfAsk =
  | { readonly kind: 'scan'; readonly id: string }
  | { readonly kind: 'crawl'; readonly id: string }
  | { readonly kind: 'compare-scans'; readonly base: string; readonly head: string }
  | { readonly kind: 'compare-crawls'; readonly base: string; readonly head: string }

export function requestOf(ask: PdfAsk, language: 'ar' | 'en'): PdfRequest {
  switch (ask.kind) {
    case 'scan':
    case 'crawl':
      return { kind: ask.kind, id: ask.id, language }
    case 'compare-scans':
    case 'compare-crawls':
      return { kind: ask.kind, base: ask.base, head: ask.head, language }
  }
}

export const isLogoProblem = (value: unknown): value is LogoProblem =>
  typeof value === 'string' && (LOGO_PROBLEMS as readonly string[]).includes(value)

/** The logo's address, with the time of the last change so a new one is not shown from the cache. */
export const logoHref = (updatedAt: string | null): string =>
  `${BRAND_LOGO_PATH}${updatedAt === null ? '' : `?v=${encodeURIComponent(updatedAt)}`}`

export type { PdfKind }

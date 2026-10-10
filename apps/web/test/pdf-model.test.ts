import { describe, expect, it, vi } from 'vitest'
import { deletePdf, getBrand, askPdf, uploadLogo } from '../src/islands/pdf-api'
import {
  isBrandSettings,
  isMaking,
  isPdfsResponse,
  isPdfSummary,
  isReportBrand,
  logoHref,
  pdfProblemOf,
  requestOf,
} from '../src/islands/pdf-model'

const JOB = {
  id: 'P'.repeat(22),
  kind: 'scan',
  subject: 'S'.repeat(22),
  base: null,
  language: 'ar',
  state: 'queued',
  error: null,
  bytes: null,
  createdAt: '2026-10-10T10:00:00.000Z',
  finishedAt: null,
}
const respond = (status: number, body: unknown) =>
  vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  )

describe('the PDF answers', () => {
  it('accepts what the API sends and nothing else', () => {
    expect(isPdfSummary(JOB)).toBe(true)
    expect(isMaking(JOB as never)).toBe(true)
    for (const bad of [
      null,
      {},
      { ...JOB, kind: 'html' },
      { ...JOB, state: 'weird' },
      { ...JOB, bytes: -1 },
    ]) {
      expect(isPdfSummary(bad), JSON.stringify(bad)).toBe(false)
    }
    expect(isPdfsResponse({ pdfs: [JOB], allowance: { perMonth: 3, used: 1 } })).toBe(true)
    expect(isPdfsResponse({ pdfs: [JOB], allowance: { perMonth: 3 } })).toBe(false)
    const brand = {
      available: true,
      name: 'X',
      color: '#0b3d2e',
      hasLogo: false,
      logoType: null,
      credit: true,
      colorFallback: false,
      updatedAt: null,
    }
    expect(isBrandSettings(brand)).toBe(true)
    expect(isBrandSettings({ ...brand, color: 'red' })).toBe(false)
    expect(isReportBrand({ name: 'X', color: null, hasLogo: false, credit: true })).toBe(true)
    expect(isReportBrand({ name: '', color: null, hasLogo: false, credit: true })).toBe(false)
  })

  it('turns an asked-for PDF into the request the API reads, and a logo address that changes with it', () => {
    expect(requestOf({ kind: 'scan', id: 'a' }, 'en')).toEqual({
      kind: 'scan',
      id: 'a',
      language: 'en',
    })
    expect(requestOf({ kind: 'compare-crawls', base: 'a', head: 'b' }, 'ar')).toEqual({
      kind: 'compare-crawls',
      base: 'a',
      head: 'b',
      language: 'ar',
    })
    expect(logoHref('2026-10-10T10:00:00.000Z')).toContain('?v=2026-10-10T10%3A00')
    expect(logoHref(null)).toBe('/api/account/brand/logo')
  })

  it('names the problems the buttons word', () => {
    expect(pdfProblemOf('plan-limit')).toBe('plan-limit')
    expect(pdfProblemOf('not-comparable')).toBe('not-found')
    expect(pdfProblemOf('invalid-token')).toBe('unavailable')
  })
})

describe('the PDF requests', () => {
  it('asks in JSON with the session, and reads a refusal by its code', async () => {
    const send = respond(202, JOB)
    const made = await askPdf({ kind: 'scan', id: 'a'.repeat(22) }, 'ar', send)
    expect(made).toMatchObject({ ok: true })
    expect(send).toHaveBeenCalledWith(
      '/api/pdf',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        referrerPolicy: 'no-referrer',
      }),
    )
    const limit = await askPdf(
      { kind: 'scan', id: 'a'.repeat(22) },
      'ar',
      respond(403, { error: 'plan-limit' }),
    )
    expect(limit).toEqual({ ok: false, problem: 'plan-limit' })
    const conflict = await askPdf(
      { kind: 'scan', id: 'a'.repeat(22) },
      'ar',
      respond(409, { error: 'conflict' }),
    )
    expect(conflict).toEqual({ ok: false, problem: 'conflict' })
    const pair = await askPdf(
      { kind: 'scan', id: 'a'.repeat(22) },
      'ar',
      respond(422, { error: 'not-comparable' }),
    )
    expect(pair).toEqual({ ok: false, problem: 'not-found' })
    expect(
      await askPdf({ kind: 'scan', id: 'a' }, 'ar', respond(202, { nonsense: true }) as never),
    ).toEqual({ ok: false, problem: 'unavailable' })
    expect(
      await askPdf({ kind: 'scan', id: 'a' }, 'ar', (() =>
        Promise.reject(new Error('down')))),
    ).toEqual({ ok: false, problem: 'network' })
    expect(await deletePdf('x', respond(404, { error: 'not-found' }) as never)).toEqual({
      ok: false,
      problem: 'not-found',
    })
    expect(await getBrand(respond(404, { error: 'not-found' }) as never)).toMatchObject({
      ok: false,
    })
  })

  it('sends a logo’s bytes as they are and carries the reason a logo was refused', async () => {
    const send = respond(400, { error: 'bad-request', logo: 'too-large' })
    const result = await uploadLogo(new Blob([new Uint8Array([1, 2, 3])]), send)
    expect(result).toEqual({ ok: false, problem: 'bad-request', logo: 'too-large' })
    const [, init] = send.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('PUT')
    expect(init.body).toBeInstanceOf(Blob)
    expect((init.headers as Record<string, string>)['content-type']).toBe(
      'application/octet-stream',
    )
  })
})

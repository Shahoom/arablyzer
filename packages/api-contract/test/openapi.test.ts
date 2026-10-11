import { reportJsonSchema } from '@arablyzer/report-schema'
import { Validator } from '@seriousme/openapi-schema-validator'
import { describe, expect, it } from 'vitest'
import {
  API_KEY_PATTERN,
  buildOpenApi,
  decodeCursor,
  encodeCursor,
  RunToolRequest,
  StartScanRequest,
  V1_ERROR_CODES,
  V1_ERROR_STATUS,
  V1Error,
} from '../src/index'

const doc = buildOpenApi({ reportSchema: reportJsonSchema(), version: '1.0.0' }) as {
  paths: Record<string, Record<string, { operationId: string; responses: Record<string, unknown> }>>
  components: { schemas: Record<string, unknown>; responses: Record<string, unknown> }
}

describe('the OpenAPI document', () => {
  it('is a valid OpenAPI 3.1 document', async () => {
    const result = await new Validator().validate(doc)
    expect(result.errors ?? []).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('resolves every reference it makes', () => {
    const refs = new Set(JSON.stringify(doc).match(/"#\/components\/[^"]+"/g))
    expect(refs.size).toBeGreaterThan(10)
    for (const quoted of refs) {
      const path = (JSON.parse(quoted) as string).slice(2).split('/')
      let at: unknown = doc
      for (const part of path) at = (at as Record<string, unknown> | undefined)?.[part]
      expect(at, quoted).toBeDefined()
    }
    // The report's own definitions came along.
    expect(Object.keys(doc.components.schemas).some((name) => name.startsWith('Report.'))).toBe(
      true,
    )
    expect(JSON.stringify(doc)).not.toContain('#/$defs')
  })

  it('names every operation once and documents every refusal it can give', () => {
    const ids = Object.values(doc.paths).flatMap((methods) =>
      Object.values(methods).map((operation) => operation.operationId),
    )
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(
      expect.arrayContaining(['startScan', 'getScan', 'getReport', 'listTools', 'runTool']),
    )
    for (const code of V1_ERROR_CODES) expect(V1_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400)
  })
})

describe('the v1 schemas', () => {
  it('take an address and engines, nothing else', () => {
    expect(StartScanRequest.safeParse({ url: 'https://example.com' }).success).toBe(true)
    expect(
      StartScanRequest.safeParse({ url: 'https://example.com', engines: ['chromium', 'webkit'] })
        .success,
    ).toBe(true)
    for (const bad of [
      {},
      { url: '' },
      { url: 'https://example.com', engines: [] },
      { url: 'https://example.com', engines: ['ie'] },
      { url: 'https://example.com', tool: 'x' },
    ]) {
      expect(StartScanRequest.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
    expect(
      RunToolRequest.safeParse({ url: 'https://example.com', engines: ['chromium'] }).success,
    ).toBe(false)
  })

  it('has an error envelope with a stable code', () => {
    expect(V1Error.safeParse({ error: { code: 'accounts_off', message: 'x' } }).success).toBe(true)
    expect(V1Error.safeParse({ error: { code: 'nope', message: 'x' } }).success).toBe(false)
  })

  it('has keys of arb_ and 43 characters', () => {
    expect(API_KEY_PATTERN.test(`arb_${'a'.repeat(43)}`)).toBe(true)
    expect(API_KEY_PATTERN.test(`arb_${'a'.repeat(42)}`)).toBe(false)
    expect(API_KEY_PATTERN.test(`key_${'a'.repeat(43)}`)).toBe(false)
  })

  it('round-trips cursors and refuses what it did not give', () => {
    for (const offset of [0, 20, 53, 99_999])
      expect(decodeCursor(encodeCursor(offset))).toBe(offset)
    expect(decodeCursor('not a cursor!')).toBeNull()
    expect(decodeCursor(btoa('-1'))).toBeNull()
    expect(decodeCursor(btoa('abc'))).toBeNull()
  })
})

import { buildOpenApi, V1_ERROR_CODES, V1_ERROR_STATUS } from '@arablyzer/api-contract'
import { reportJsonSchema } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { DEVELOPERS_UI } from '../src/developers'

const doc = buildOpenApi({ reportSchema: reportJsonSchema() }) as {
  paths: Record<string, Record<string, unknown>>
}

describe('the developers’ page', () => {
  for (const lang of ['ar', 'en'] as const) {
    const t = DEVELOPERS_UI[lang]

    it(`${lang}: lists the endpoints the OpenAPI document has, and no others`, () => {
      const written = t.endpoints.rows.map(
        (row) => `${row.method.toLowerCase()} /api/v1${row.path}`,
      )
      const documented = Object.entries(doc.paths).flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method} ${path}`),
      )
      expect(written.sort()).toEqual(documented.sort())
    })

    it(`${lang}: lists the error codes and statuses the API gives`, () => {
      expect(t.errors.rows.map(([code]) => code).sort()).toEqual([...V1_ERROR_CODES].sort())
      for (const [code, status] of t.errors.rows) {
        expect(status, code).toBe(String(V1_ERROR_STATUS[code as keyof typeof V1_ERROR_STATUS]))
      }
    })

    it(`${lang}: names the four MCP tools`, () => {
      expect(t.mcp.tools.map(([name]) => name).sort()).toEqual([
        'get_report',
        'list_tools',
        'run_tool',
        'scan_page',
      ])
    })
  }

  it('says the same things in both languages', () => {
    expect(DEVELOPERS_UI.ar.endpoints.rows.map((row) => row.path)).toEqual(
      DEVELOPERS_UI.en.endpoints.rows.map((row) => row.path),
    )
    expect(Object.keys(DEVELOPERS_UI.ar.keys.problems).sort()).toEqual(
      Object.keys(DEVELOPERS_UI.en.keys.problems).sort(),
    )
    expect(DEVELOPERS_UI.ar.keys.count(1, 2)).toMatch(/1/)
    expect(DEVELOPERS_UI.reviewed).toBe(false)
  })
})

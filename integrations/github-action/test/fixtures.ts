import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Report } from '@arablyzer/report-schema'

const dir = fileURLToPath(new URL('../../../fixtures/golden/reports/', import.meta.url))

/** The golden reports: real engine output, from every fixture site. */
export function goldenReports(): { name: string; report: Report }[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ name, report: JSON.parse(readFileSync(`${dir}${name}`, 'utf8')) as Report }))
}

export const golden = (prefix: string): Report => {
  const found = goldenReports().find(({ name }) => name.startsWith(prefix))
  if (found === undefined) throw new Error(`No golden report ${prefix}`)
  return found.report
}

export const ID = 'AbCdEfGhIjKlMnOpQrSt_-'
export const KEY = `arb_${'k'.repeat(43)}`
export const ORIGIN = 'https://arablyzer.example'

export const scanJson = (state: string, extra: object = {}) => ({
  id: ID,
  url: 'https://shop.example/',
  state,
  tool: null,
  createdAt: '2026-10-11T12:00:00.000Z',
  score: null,
  links: {
    status: `/api/v1/scans/${ID}`,
    report: `/api/v1/scans/${ID}/report`,
    page: `${ORIGIN}/r/${ID}`,
  },
  reused: false,
  ...extra,
})

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

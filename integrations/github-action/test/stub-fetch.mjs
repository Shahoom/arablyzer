// Preloaded (node --import) by dist.test.ts: stands in for the Arablyzer API, so the committed
// bundle can be run as GitHub runs it, with no network. Answers a finished scan and the report in
// the file named by STUB_REPORT; STUB_LOG gets one line per request.
import { appendFileSync, readFileSync } from 'node:fs'

const id = 'AbCdEfGhIjKlMnOpQrSt_-'
const report = JSON.parse(readFileSync(process.env.STUB_REPORT, 'utf8'))
const scan = {
  id,
  url: report.target.url,
  state: 'complete',
  tool: null,
  createdAt: '2026-10-11T12:00:00.000Z',
  score: report.score.overall,
  links: { status: `/api/v1/scans/${id}`, report: `/api/v1/scans/${id}/report`, page: `/r/${id}` },
  reused: false,
}
const answer = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

// eslint-disable-next-line no-restricted-properties -- the stand-in for the API, in a test
globalThis.fetch = (input, init) => {
  const url = new URL(String(input))
  appendFileSync(process.env.STUB_LOG, `${init?.method ?? 'GET'} ${url.origin}${url.pathname}\n`)
  if (url.pathname.endsWith('/report')) return Promise.resolve(answer(200, { data: report }))
  return Promise.resolve(answer(init?.method === 'POST' ? 202 : 200, { data: scan }))
}

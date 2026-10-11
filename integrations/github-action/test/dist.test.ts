import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { golden, KEY } from './fixtures'

// The committed bundle, run as GitHub runs it: node dist/index.mjs, with INPUT_* and the runner's
// files in the environment. The API is a stand-in preloaded into the process.
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const work = mkdtempSync(join(tmpdir(), 'arablyzer-dist-'))
afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

describe('dist/index.mjs', () => {
  it('runs end to end: outputs, summary, SARIF, the exit code', () => {
    const report = golden('10-')
    writeFileSync(join(work, 'report.json'), JSON.stringify(report))
    for (const name of ['output', 'summary', 'requests']) writeFileSync(join(work, name), '')
    const run = spawnSync(
      process.execPath,
      ['--import', here('./stub-fetch.mjs'), here('../dist/index.mjs')],
      {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          GITHUB_WORKSPACE: work,
          GITHUB_OUTPUT: join(work, 'output'),
          GITHUB_STEP_SUMMARY: join(work, 'summary'),
          STUB_REPORT: join(work, 'report.json'),
          STUB_LOG: join(work, 'requests'),
          INPUT_URL: report.target.url,
          INPUT_API_KEY: KEY,
          INPUT_API_URL: 'https://arablyzer.example',
          INPUT_FAIL_ON: 'critical',
        },
      },
    )
    // Report 10 has critical findings, so the gate fails the step.
    expect(run.status, run.stderr).toBe(1)
    expect(run.stdout).toContain(`::add-mask::${KEY}`)
    expect(run.stdout).toContain('::error::')
    expect(readFileSync(join(work, 'requests'), 'utf8').split('\n').filter(Boolean)).toEqual([
      'POST https://arablyzer.example/api/v1/scans',
      'GET https://arablyzer.example/api/v1/scans/AbCdEfGhIjKlMnOpQrSt_-/report',
    ])
    const outputs = readFileSync(join(work, 'output'), 'utf8')
    expect(outputs).toMatch(/score<<ghadelimiter_[\w-]+\n71\n/)
    expect(outputs).toMatch(/result<<ghadelimiter_[\w-]+\nfail\n/)
    expect(readFileSync(join(work, 'summary'), 'utf8')).toContain('Score: **71 of 100**')
    const files = readdirSync(join(work, 'arablyzer-sarif'))
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/\.sarif$/)
  })

  it('stops on a missing key without any request', () => {
    const run = spawnSync(process.execPath, [here('../dist/index.mjs')], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        GITHUB_WORKSPACE: work,
        INPUT_URL: 'https://shop.example/',
      },
    })
    expect(run.status).toBe(1)
    expect(run.stdout).toContain('::error::`api_key` must be an API key')
  })
})

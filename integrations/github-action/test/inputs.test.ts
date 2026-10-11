import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { INPUT_NAMES, InputError, MAX_URLS, readInputs } from '../src/inputs'
import { OUTPUT_NAMES } from '../src/run'
import { VERSION } from '../src/version'
import { KEY } from './fixtures'

const base = { INPUT_URL: 'https://shop.example/', INPUT_API_KEY: KEY, GITHUB_WORKSPACE: '/work' }
const read = (extra: Record<string, string> = {}) => readInputs({ ...base, ...extra })
const refused = (extra: Record<string, string>) => {
  try {
    read(extra)
  } catch (error) {
    expect(error).toBeInstanceOf(InputError)
    return (error as Error).message
  }
  throw new Error('was accepted')
}

describe('the Action’s inputs', () => {
  it('has defaults a first run can use', () => {
    expect(read()).toEqual({
      urls: ['https://shop.example/'],
      apiKey: KEY,
      origin: 'https://arablyzer.com',
      failOn: 'none',
      wait: true,
      lang: 'en',
      sarifDir: '/work/arablyzer-sarif',
      timeoutMs: 300_000,
      maxIssues: 10,
    })
  })

  it('takes url and urls together, one per line or comma, without repeats', () => {
    const inputs = read({
      INPUT_URLS: 'https://a.example/x\nhttps://b.example, https://shop.example/\n',
    })
    expect(inputs.urls).toEqual([
      'https://shop.example/',
      'https://a.example/x',
      'https://b.example/',
    ])
    expect(refused({ INPUT_URL: '', INPUT_URLS: '' })).toContain('`url`')
    const many = Array.from({ length: MAX_URLS + 1 }, (_, i) => `https://s${String(i)}.example/`)
    expect(refused({ INPUT_URLS: many.join('\n') })).toContain('At most')
  })

  it('refuses addresses a scan never takes, without echoing a password', () => {
    expect(refused({ INPUT_URL: 'ftp://x.example/' })).toContain('http or https')
    expect(refused({ INPUT_URL: 'not a url' })).toContain('not an address')
    const message = refused({ INPUT_URL: 'https://me:secret@x.example/' })
    expect(message).toContain('user name or password')
    expect(message).not.toContain('secret')
  })

  it('wants a real key shape, and says nothing of what was given', () => {
    const message = refused({ INPUT_API_KEY: 'arb_short' })
    expect(message).toContain('api_key')
    expect(message).not.toContain('arb_short')
    expect(refused({ INPUT_API_KEY: '' })).toContain('api_key')
  })

  it('checks each setting', () => {
    expect(read({ INPUT_FAIL_ON: 'Serious', INPUT_WAIT: 'FALSE', INPUT_LANG: 'AR' })).toMatchObject(
      {
        failOn: 'serious',
        wait: false,
        lang: 'ar',
      },
    )
    expect(refused({ INPUT_FAIL_ON: 'moderate' })).toContain('fail_on')
    expect(refused({ INPUT_WAIT: 'yes' })).toContain('wait')
    expect(refused({ INPUT_LANG: 'fr' })).toContain('lang')
    expect(refused({ INPUT_TIMEOUT_SECONDS: '5' })).toContain('timeout_seconds')
    expect(refused({ INPUT_MAX_ISSUES: '0' })).toContain('max_issues')
    expect(refused({ INPUT_API_URL: 'ftp://x.example' })).toContain('api_url')
    expect(read({ INPUT_API_URL: 'https://arablyzer.example/' }).origin).toBe(
      'https://arablyzer.example',
    )
  })

  it('keeps the SARIF folder inside the workspace', () => {
    expect(read({ INPUT_SARIF_DIR: 'out/sarif' }).sarifDir).toBe('/work/out/sarif')
    expect(refused({ INPUT_SARIF_DIR: '../elsewhere' })).toContain('inside the workspace')
    expect(refused({ INPUT_SARIF_DIR: '/etc' })).toContain('inside the workspace')
    expect(refused({ INPUT_SARIF_DIR: '.' })).toContain('inside the workspace')
  })
})

describe('action.yml', () => {
  const file = readFileSync(fileURLToPath(new URL('../action.yml', import.meta.url)), 'utf8')
  const section = (name: string): string[] => {
    const body = file.split(new RegExp(`^${name}:\\n`, 'm'))[1]?.split(/^\S/m)[0] ?? ''
    return [...body.matchAll(/^ {2}([a-z_]+):\s*$/gm)].map((match) => match[1] ?? '')
  }

  it('declares the inputs the code reads, and the outputs it sets', () => {
    expect(section('inputs')).toEqual([...INPUT_NAMES])
    expect(section('outputs')).toEqual([...OUTPUT_NAMES])
  })

  it('runs the committed bundle on Node 24, and the version is the package’s', () => {
    expect(file).toMatch(/using: node24\n\s+main: dist\/index\.mjs/)
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { version: string }
    expect(VERSION).toBe(pkg.version)
  })
})

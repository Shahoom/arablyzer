import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildExtension, zipExtension } from '../scripts/build'
import { drawMark, markPng } from '../scripts/icons'

// What the Chrome Web Store reviews, checked on the built extension: the permissions, the
// content security policy, that nothing is remote, that every file the manifest names exists.

const out = mkdtempSync(join(tmpdir(), 'arablyzer-ext-'))
let files: string[] = []
beforeAll(async () => {
  files = (await buildExtension(out)).files
}, 30_000)
afterAll(() => {
  rmSync(out, { recursive: true, force: true })
})

const read = (name: string) => readFileSync(join(out, name), 'utf8')
const manifest = () =>
  JSON.parse(read('manifest.json')) as {
    version: string
    permissions: string[]
    host_permissions: string[]
    optional_host_permissions: string[]
    content_security_policy: { extension_pages: string }
    icons: Record<string, string>
    action: { default_popup: string; default_icon: Record<string, string> }
    options_ui: { page: string }
    default_locale: string
    [key: string]: unknown
  }

describe('the built extension', () => {
  it('asks for activeTab and storage, and no host but Arablyzer’s own at install', () => {
    const m = manifest()
    expect(m.permissions).toEqual(['activeTab', 'storage'])
    expect(m.host_permissions).toEqual(['https://arablyzer.com/*'])
    // Others (a self-hosted service) are asked for one at a time, from the options page.
    expect(m.optional_host_permissions).toEqual([
      'https://*/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ])
    for (const banned of [
      'tabs',
      'webRequest',
      'cookies',
      'history',
      'scripting',
      'background',
      'content_scripts',
    ]) {
      expect(m.permissions, banned).not.toContain(banned)
      expect(m, banned).not.toHaveProperty(banned)
    }
    expect(m.version).toBe(
      (
        JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
          version: string
        }
      ).version,
    )
  })

  it('has a policy with no eval, no inline script or style, and no remote script', () => {
    const csp = manifest().content_security_policy.extension_pages
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline|wasm-unsafe-eval/)
    expect(csp).not.toMatch(/script-src[^;]*https?:/)
  })

  it('names only files that exist, and a locale for every message it uses', () => {
    const m = manifest()
    const named = [
      ...Object.values(m.icons),
      ...Object.values(m.action.default_icon),
      m.action.default_popup,
      m.options_ui.page,
    ]
    for (const name of named) expect(files, name).toContain(name)
    const used = new Set([...JSON.stringify(m).matchAll(/__MSG_(\w+)__/g)].map((x) => x[1]))
    for (const lang of ['ar', 'en']) {
      const messages = JSON.parse(read(`_locales/${lang}/messages.json`)) as Record<
        string,
        { message: string }
      >
      for (const key of used)
        expect(messages[String(key)]?.message, `${lang} ${String(key)}`).toBeTruthy()
    }
    expect(m.default_locale).toBe('ar')
  })

  it('has pages with no inline script or style and no remote file', () => {
    for (const page of ['popup.html', 'options.html']) {
      const html = read(page)
      expect(html, page).not.toMatch(/\sstyle\s*=/i)
      expect(html, page).not.toMatch(/\son[a-z]+\s*=/i)
      expect(html, page).not.toMatch(/<style[\s>]/i)
      for (const script of html.matchAll(/<script\b[^>]*>/g)) {
        expect(script[0], page).toMatch(/\ssrc="[a-z-]+\.js"/)
      }
      expect(html, page).not.toMatch(/(src|href)="https?:/i)
    }
    expect(read('ui.css')).not.toMatch(/url\(|@import/)
  })

  it('has code that sets no markup, evaluates nothing and reaches no fixed third party', () => {
    for (const script of ['popup.js', 'options.js']) {
      const code = read(script)
      expect(code, script).not.toMatch(/\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/)
      expect(code, script).not.toMatch(/\beval\(|new Function\(/)
      expect(code, script).not.toMatch(/import\(\s*["']https?:/)
      // The one address in the code is the service's own (the default).
      const hosts = new Set([...code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]))
      for (const host of hosts) {
        expect(
          ['arablyzer.com', 'localhost', '127.0.0.1', 'json.schemastore.org', 'www.w3.org'],
          `${script} ${String(host)}`,
        ).toContain(host)
      }
    }
  })

  it('has real icons: PNGs of the sizes the manifest names', () => {
    for (const size of [16, 32, 48, 128]) {
      const png = readFileSync(join(out, `icons/icon-${String(size)}.png`))
      expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      expect(png.readUInt32BE(16)).toBe(size)
      expect(png.readUInt32BE(20)).toBe(size)
    }
    const px = drawMark(32)
    // Transparent in the corner, the brand teal at the top left inside, white on a line.
    expect(px[3]).toBe(0)
    const at = (x: number, y: number) => [...px.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)]
    expect(at(3, 3)[3]).toBeGreaterThan(200)
    expect(at(20, 10)).toEqual([255, 255, 255, 255])
    expect(markPng(16).length).toBeGreaterThan(100)
  })

  it('zips into an archive with every file, whole, in a fixed order', async () => {
    const archive = await zipExtension(out, files)
    const again = await zipExtension(out, files)
    expect(archive.equals(again)).toBe(true)
    const eocd = archive.length - 22
    expect(archive.readUInt32LE(eocd)).toBe(0x06054b50)
    const count = archive.readUInt16LE(eocd + 10)
    expect(count).toBe(files.length)
    let at = archive.readUInt32LE(eocd + 16)
    const seen: string[] = []
    for (let i = 0; i < count; i++) {
      expect(archive.readUInt32LE(at)).toBe(0x02014b50)
      const packed = archive.readUInt32LE(at + 20)
      const size = archive.readUInt32LE(at + 24)
      const nameLength = archive.readUInt16LE(at + 28)
      const offset = archive.readUInt32LE(at + 42)
      const name = archive.subarray(at + 46, at + 46 + nameLength).toString('utf8')
      const start =
        offset + 30 + archive.readUInt16LE(offset + 26) + archive.readUInt16LE(offset + 28)
      const data = inflateRawSync(archive.subarray(start, start + packed))
      expect(data.length).toBe(size)
      expect(data.equals(readFileSync(join(out, name))), name).toBe(true)
      seen.push(name)
      at += 46 + nameLength
    }
    expect(seen).toEqual(files)
    expect(readdirSync(out).length).toBeGreaterThan(5)
    expect(statSync(join(out, 'popup.js')).size).toBeGreaterThan(1000)
  })
})

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { indexNowKey, sitemapUrls } from '../scripts/indexnow'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('indexNowKey', () => {
  it("is the deployment's, when it has one, and checked", () => {
    expect(indexNowKey({})).toBeNull()
    expect(indexNowKey({ ARABLYZER_INDEXNOW_KEY: ' ' })).toBeNull()
    expect(indexNowKey({ ARABLYZER_INDEXNOW_KEY: 'a1b2c3d4e5' })).toBe('a1b2c3d4e5')
    expect(() => indexNowKey({ ARABLYZER_INDEXNOW_KEY: 'short' })).toThrow(/8 to 128/)
    expect(() => indexNowKey({ ARABLYZER_INDEXNOW_KEY: 'has spaces in it' })).toThrow(/8 to 128/)
  })
})

describe('sitemapUrls', () => {
  it("reads every address of the build's sitemaps", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'arablyzer-indexnow-'))
    dirs.push(dir)
    mkdirSync(path.join(dir, 'sitemaps'))
    writeFileSync(
      path.join(dir, 'sitemap.xml'),
      '<sitemapindex><sitemap><loc>https://arablyzer.example/sitemaps/pages.xml</loc></sitemap></sitemapindex>',
    )
    writeFileSync(
      path.join(dir, 'sitemaps/pages.xml'),
      '<urlset><url><loc>https://arablyzer.example/</loc></url><url><loc>https://arablyzer.example/en/</loc></url></urlset>',
    )
    expect(await sitemapUrls(dir)).toEqual([
      'https://arablyzer.example/',
      'https://arablyzer.example/en/',
    ])
  })
})

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { indexNowKey, ON_BUILD_SECTIONS, pingsOnBuild, sitemapUrls } from '../scripts/indexnow'

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

describe('pingsOnBuild', () => {
  const key = { ARABLYZER_INDEXNOW_KEY: 'a1b2c3d4e5' }

  it('pings only for a deployment that asked, with a key, for a real domain', () => {
    const asked = {
      ...key,
      ARABLYZER_INDEXNOW_ON_BUILD: '1',
      ARABLYZER_SITE: 'https://arablyzer.org',
    }
    expect(pingsOnBuild(asked)).toBe(true)
    expect(pingsOnBuild({})).toBe(false)
    expect(pingsOnBuild({ ...asked, ARABLYZER_INDEXNOW_ON_BUILD: '0' })).toBe(false)
    expect(pingsOnBuild({ ...asked, ARABLYZER_INDEXNOW_KEY: '' })).toBe(false)
    // CI builds for the preview domain, and never tells anyone.
    expect(pingsOnBuild({ ...asked, ARABLYZER_SITE: 'https://arablyzer.example' })).toBe(false)
    expect(pingsOnBuild({ ...asked, ARABLYZER_SITE: '' })).toBe(false)
  })

  it('tells of the pages that change with the content: the blog and the comparisons', () => {
    expect(ON_BUILD_SECTIONS).toEqual(['blog', 'compare'])
  })
})

describe('sitemapUrls of some sections', () => {
  it('reads only the sitemaps of the sections asked for', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'arablyzer-indexnow-'))
    dirs.push(dir)
    mkdirSync(path.join(dir, 'sitemaps'))
    writeFileSync(
      path.join(dir, 'sitemap.xml'),
      '<sitemapindex><sitemap><loc>https://arablyzer.example/sitemaps/pages.xml</loc></sitemap><sitemap><loc>https://arablyzer.example/sitemaps/blog.xml</loc></sitemap></sitemapindex>',
    )
    writeFileSync(
      path.join(dir, 'sitemaps/pages.xml'),
      '<urlset><url><loc>https://arablyzer.example/</loc></url></urlset>',
    )
    writeFileSync(
      path.join(dir, 'sitemaps/blog.xml'),
      '<urlset><url><loc>https://arablyzer.example/blog/a</loc></url></urlset>',
    )
    expect(await sitemapUrls(dir, ['blog'])).toEqual(['https://arablyzer.example/blog/a'])
    expect(await sitemapUrls(dir)).toHaveLength(2)
  })
})

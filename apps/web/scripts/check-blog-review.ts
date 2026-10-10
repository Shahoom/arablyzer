import { readdirSync, readFileSync } from 'node:fs'
import { parseFrontmatter } from '@arablyzer/seo/article'

// Design decision 7, for the articles' own words as for the interface copy (packages/i18n): CI
// stays red until the owner has read each article and set `reviewed: true` in its frontmatter.
// A draft is not published, so it waits for nobody.
const ROOT = new URL('../src/content/blog/', import.meta.url)

/** The files, by their path under src/content/blog, whose frontmatter does not say reviewed: true. */
export function pendingReview(files: Readonly<Record<string, string>>): string[] {
  return Object.entries(files)
    .filter(([, raw]) => {
      const { data } = parseFrontmatter(raw)
      return data.draft !== true && data.reviewed !== true
    })
    .map(([file]) => file)
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const files: Record<string, string> = {}
  for (const dir of readdirSync(ROOT, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    for (const file of readdirSync(new URL(`${dir.name}/`, ROOT))) {
      if (file.endsWith('.md')) {
        files[`${dir.name}/${file}`] = readFileSync(new URL(`${dir.name}/${file}`, ROOT), 'utf8')
      }
    }
  }
  const pending = pendingReview(files)
  if (pending.length > 0) {
    console.error(
      [
        `Articles waiting for the owner's review (${pending.length} of ${Object.keys(files).length}):`,
        ...pending.map((file) => `  - apps/web/src/content/blog/${file}`),
        'Read the article and set "reviewed: true" in its frontmatter.',
      ].join('\n'),
    )
    process.exitCode = 1
  } else {
    console.log(`Articles reviewed in all ${Object.keys(files).length} files.`)
  }
}

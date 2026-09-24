import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { auditSite } from '../src/audit/index'
import { PREVIEW_SITE } from '../src/index'

// CI step "SEO self-audit" (docs/design/phase-0.md §4.7). --out <dir> also writes the pages,
// to look at them in a browser.
const { values } = parseArgs({ options: { out: { type: 'string' } } })
const { pages, problems } = auditSite()

if (values.out !== undefined) {
  for (const page of pages) {
    const file = path.join(values.out, page.file)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, page.html)
  }
  console.log(`Wrote ${pages.length} pages to ${values.out}`)
}

if (problems.length > 0) {
  console.error(`SEO self-audit (${PREVIEW_SITE.origin}): ${problems.length} problems`)
  for (const problem of problems) {
    console.error(`  ${problem.page} [${problem.check}] ${problem.message}`)
  }
  process.exitCode = 1
} else {
  console.log(`SEO self-audit (${PREVIEW_SITE.origin}): ${pages.length} pages, no problems.`)
}

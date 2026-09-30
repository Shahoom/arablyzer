import path from 'node:path'
import { parseArgs } from 'node:util'
import { auditBuiltSite } from '../src/audit/index'
import { defineSite, PREVIEW_SITE } from '../src/index'

// CI step "Site self-audit" (M2.1 plan §3): the pages Astro built in apps/web/dist, for the site
// they were built for (ARABLYZER_SITE, as the build reads it).
const { values } = parseArgs({ options: { dist: { type: 'string' } } })
// pnpm runs package scripts in the package; INIT_CWD is where the command was typed.
const root = process.env.INIT_CWD ?? process.cwd()
const dist = path.resolve(root, values.dist ?? 'apps/web/dist')
const site = defineSite(process.env.ARABLYZER_SITE ?? PREVIEW_SITE.origin)
const { pages, problems } = auditBuiltSite(dist, site)

if (pages.length === 0) {
  console.error(`Site self-audit: no pages in ${dist}; build the site first.`)
  process.exitCode = 1
} else if (problems.length > 0) {
  console.error(`Site self-audit (${site.origin}): ${problems.length} problems`)
  for (const problem of problems) {
    console.error(`  ${problem.page} [${problem.check}] ${problem.message}`)
  }
  process.exitCode = 1
} else {
  console.log(`Site self-audit (${site.origin}): ${pages.length} pages, no problems.`)
}

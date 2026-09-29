import { toolDefinition } from '../src/registry'
import { defineTool } from '../src/tool'
import { exampleProblems } from '../test/example-check'

// Checks the copy of the tools named, as it is written: each file parses, both languages ask
// the same questions and list as many checks, and the examples are live (test/example-check.ts).
// The whole suite (`pnpm --filter @arablyzer/tools test`) needs every tool's copy; this does not.
//
//   pnpm --filter @arablyzer/tools exec tsx scripts/check-copy.ts rtl-check whatsapp-link-check
const slugs = process.argv.slice(2)
if (slugs.length === 0) throw new Error('Name the tools to check')
let failed = false
for (const slug of slugs) {
  const definition = toolDefinition(slug)
  if (definition === undefined) {
    console.error(`${slug}: not in src/registry.ts`)
    failed = true
    continue
  }
  const problems: string[] = []
  try {
    const tool = defineTool(definition)
    const { ar, en } = tool.copy
    if (ar.reviewed === null)
      problems.push('copy.ar.md needs `reviewed: false` in its front matter')
    if (ar.faq.length !== en.faq.length) problems.push('the two languages ask different questions')
    if (ar.checks.length !== en.checks.length)
      problems.push('the two languages list different checks')
    for (const lang of ['ar', 'en'] as const) {
      for (const problem of exampleProblems(tool, lang)) problems.push(`${lang}: ${problem}`)
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error))
  }
  if (problems.length > 0) failed = true
  console.log(problems.length === 0 ? `${slug}: ok` : `${slug}:\n  - ${problems.join('\n  - ')}`)
}
process.exitCode = failed ? 1 : 0

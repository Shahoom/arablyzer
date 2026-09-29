import { describe, expect, it } from 'vitest'
import { TOOLS, type Lang } from '../src/index'
import { exampleProblems } from './example-check'

// BUILD-PLAN §6.1: the example on the page is live (test/example-check.ts says how).
describe.each(
  TOOLS.flatMap((tool) => (['ar', 'en'] as const).map((lang) => [tool.slug, lang, tool] as const)),
)('%s (%s)', (_slug, lang: Lang, tool) => {
  it('shows a wrong and a right example that the tool judges as the page says', () => {
    expect(exampleProblems(tool, lang)).toEqual([])
  })
})

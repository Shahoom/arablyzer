import { defineRule } from '../../rule'

export const rule = defineRule({
  id: 'h1-missing',
  version: '1.0.0',
  category: 'onpage',
  severity: 'moderate',
  needs: ['html'],
  messages: ['missing', 'empty'],
  appliesTo: (page) => page.html !== null,
  detect: ({ page }) => {
    // Several <h1> elements are fine (docs/design/plans/m1.2-html-rules.md §2); one with text is enough.
    const h1s = page.html?.headings.filter((heading) => heading.level === 1) ?? []
    if (h1s.some((heading) => heading.text !== '')) return []
    const [first] = h1s
    if (first === undefined) return [{ message: 'missing', selector: 'body' }]
    return [
      {
        message: 'empty',
        selector: first.selector,
        ...(first.snippet === null ? {} : { snippet: first.snippet }),
        ...(first.location === null ? {} : { location: first.location }),
      },
    ]
  },
})

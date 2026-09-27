import { defineRule } from '../../rule'

export const rule = defineRule({
  id: 'title-missing',
  version: '1.0.0',
  category: 'onpage',
  severity: 'serious',
  wcag: ['2.4.2'],
  needs: ['html'],
  messages: ['missing', 'empty'],
  appliesTo: (page) => page.html !== null,
  detect: ({ page }) => {
    const html = page.html
    if (html === null || (html.title !== null && html.title !== '')) return []
    const element = html.titleElement
    if (html.title === null || element === null) return [{ message: 'missing', selector: 'head' }]
    return [
      {
        message: 'empty',
        selector: element.selector,
        ...(element.snippet === null ? {} : { snippet: element.snippet }),
        ...(element.location === null ? {} : { location: element.location }),
      },
    ]
  },
})

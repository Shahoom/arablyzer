import { defineRule } from '../../rule'

export const rule = defineRule({
  id: 'meta-description-missing',
  version: '1.0.0',
  category: 'onpage',
  severity: 'moderate',
  needs: ['html'],
  messages: ['missing', 'empty'],
  appliesTo: (page) => page.html !== null,
  detect: ({ page }) => {
    const metas = page.html?.metas.filter((meta) => meta.name === 'description') ?? []
    if (metas.some((meta) => (meta.content?.trim() ?? '') !== '')) return []
    const [first] = metas
    if (first === undefined) return [{ message: 'missing', selector: 'head' }]
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

import { comesAfter, upgradeInsecureRequests } from '../../lib/csp'
import { defineRule } from '../../rule'

/**
 * An HTTPS page that loads something over http:, or sends a form there (W3C Mixed Content).
 * Browsers block scripts, styles and frames, so the page breaks; they try images and media
 * over https: instead, or show the page as not secure; a form sends what is typed in the clear.
 * A page that asks for upgrade-insecure-requests has each fetched over https: instead.
 */
export const rule = defineRule({
  id: 'mixed-content',
  version: '1.0.0',
  category: 'trust',
  severity: 'serious',
  needs: ['headers', 'html'],
  messages: ['blockable', 'upgradable', 'form'],
  appliesTo: (page) => page.url.startsWith('https:') && page.html !== null,
  detect: ({ page }) => {
    const upgrade = upgradeInsecureRequests(page)
    return (page.html?.insecureLoads ?? [])
      .filter((load) =>
        upgrade === null ? true : upgrade !== 'header' && !comesAfter(load.location, upgrade),
      )
      .map((load) => ({
        message: load.kind,
        values: { tag: load.tag, url: load.url },
        selector: load.selector,
        ...(load.snippet === null ? {} : { snippet: load.snippet }),
        ...(load.location === null ? {} : { location: load.location }),
        key: `${load.attribute}:${load.url}`,
      }))
  },
})

import { hostnameOf, isLocalHost } from '../../lib/hosts'
import { defineRule } from '../../rule'

/**
 * A public page served over plain HTTP: browsers mark it "Not secure", anyone on the way can read
 * or change it, and many features need HTTPS. Local development addresses are left out.
 */
export const rule = defineRule({
  id: 'https-missing',
  version: '1.0.0',
  category: 'trust',
  severity: 'critical',
  needs: ['http'],
  messages: ['http'],
  appliesTo: (page) => {
    const hostname = hostnameOf(page.url)
    return hostname !== null && !isLocalHost(hostname)
  },
  detect: ({ page }) =>
    page.url.startsWith('http:') ? [{ message: 'http' as const, values: { url: page.url } }] : [],
})

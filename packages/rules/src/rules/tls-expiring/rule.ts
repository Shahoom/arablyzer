import { defineRule } from '../../rule'

const DAY = 86_400_000
/**
 * A fortnight, our choice: renewal tools such as Certbot renew 30 days before the end, so less
 * than this left means renewal has failed for over two weeks, with time still to fix it.
 */
const NOTICE = 14 * DAY

/**
 * The page's certificate runs out soon: past its end, browsers stop the visit with a warning.
 * Soon is 14 days, or a third of the certificate's lifetime when that is shorter, so a
 * short-lived certificate (Let's Encrypt's last 6 days) is not always "expiring".
 */
export const rule = defineRule({
  id: 'tls-expiring',
  version: '1.0.0',
  category: 'trust',
  severity: 'serious',
  needs: ['http'],
  messages: ['expiring', 'expired'],
  appliesTo: (page) => page.certificate !== null,
  detect: ({ page }) => {
    const certificate = page.certificate
    if (certificate === null) return []
    const from = Date.parse(certificate.validFrom)
    const to = Date.parse(certificate.validTo)
    const now = Date.parse(certificate.checkedAt)
    const date = certificate.validTo.slice(0, 10)
    if (to <= now) return [{ message: 'expired' as const, values: { date } }]
    if (to - now >= Math.min(NOTICE, (to - from) / 3)) return []
    return [{ message: 'expiring' as const, values: { days: Math.floor((to - now) / DAY), date } }]
  },
})

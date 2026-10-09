import type { Copy } from './copy'

/**
 * The words of a monitoring alert (M4.3), sent to the person's webhook in the language of their
 * account. Plain text, no markup beyond what Slack and Discord both read as text; the numbers come
 * from the scans, never from here.
 */
export interface AlertStrings {
  /** «The score of example.com dropped from 92 to 74.» */
  readonly scoreDrop: (site: string, from: number, to: number) => string
  /** «New critical findings on example.com: 2.» */
  readonly critical: (site: string, count: number) => string
  /** The scan could not run, or did not reach the page. */
  readonly down: (site: string) => string
  /** Monitoring was stopped after repeated failures. */
  readonly paused: (site: string) => string
  readonly report: string
  readonly summaryTitle: string
  /** «example.com: 82 (-3 since last time)» */
  readonly summaryLine: (site: string, score: number | null, change: number | null) => string
  readonly summaryDown: (site: string) => string
  /** The message the test button sends. */
  readonly test: string
}

const sign = (change: number) => (change > 0 ? `+${String(change)}` : String(change))

export const ALERT_TEXT: Copy<AlertStrings> = {
  reviewed: false,
  ar: {
    scoreDrop: (site, from, to) => `انخفضت درجة ${site} من ${String(from)} إلى ${String(to)}.`,
    critical: (site, count) => `ظهرت مشاكل حرجة جديدة في ${site}: ${String(count)}.`,
    down: (site) => `تعذّر فحص ${site}. قد يكون الموقع متوقفاً.`,
    paused: (site) =>
      `أوقفنا مراقبة ${site} بعد محاولات فاشلة متتالية. شغّلها من جديد من صفحة حسابك.`,
    report: 'التقرير',
    summaryTitle: 'ملخص الأسبوع من Arablyzer',
    summaryLine: (site, score, change) =>
      score === null
        ? `${site}: بلا درجة`
        : change === null
          ? `${site}: ${String(score)}`
          : `${site}: ${String(score)} (${sign(change)} عن المرة السابقة)`,
    summaryDown: (site) => `${site}: تعذّر الفحص`,
    test: 'هذه رسالة تجريبية من Arablyzer. إن وصلتك فالتنبيهات تعمل.',
  },
  en: {
    scoreDrop: (site, from, to) =>
      `The score of ${site} dropped from ${String(from)} to ${String(to)}.`,
    critical: (site, count) => `New critical findings on ${site}: ${String(count)}.`,
    down: (site) => `${site} could not be scanned. The site may be down.`,
    paused: (site) =>
      `Monitoring of ${site} was stopped after repeated failures. Turn it on again from your account page.`,
    report: 'Report',
    summaryTitle: 'Your Arablyzer summary for the week',
    summaryLine: (site, score, change) =>
      score === null
        ? `${site}: no score`
        : change === null
          ? `${site}: ${String(score)}`
          : `${site}: ${String(score)} (${sign(change)} since last time)`,
    summaryDown: (site) => `${site}: could not be scanned`,
    test: 'This is a test message from Arablyzer. If you can read it, alerts work.',
  },
}

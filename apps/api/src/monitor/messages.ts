import { ALERT_TEXT } from '@arablyzer/i18n/alerts'
import type { AlertEvent, Facts } from './evaluate'
import type { WhatsAppTemplate } from './whatsapp'
import type { AlertMessage } from './webhook'

export type Language = 'ar' | 'en'

/** An address as a message shows it: the scheme and a lone trailing slash are noise. */
export const siteLabel = (url: string): string =>
  url.replace(/^https?:\/\//i, '').replace(/\/$/, '')

/** A report's page on the site, in the person's language (the English pages are under /en). */
export function reportUrl(origin: string, language: Language, scanId: string): string {
  return `${origin}${language === 'en' ? '/en' : ''}/r/${scanId}`
}

export interface RunInfo {
  readonly url: string
  readonly scanId: string
  readonly report: string
  readonly facts: Facts
}

/** The message for one run's events: a sentence each, then the report. */
export function alertMessage(
  language: Language,
  run: RunInfo,
  events: readonly AlertEvent[],
  at: Date,
): AlertMessage {
  const t = ALERT_TEXT[language]
  const site = siteLabel(run.url)
  const lines = events.map((event) => {
    switch (event.type) {
      case 'score-drop':
        return t.scoreDrop(site, event.from, event.to)
      case 'critical':
        return t.critical(site, event.count)
      case 'down':
        return t.down(site)
      case 'paused':
        return t.paused(site)
    }
  })
  lines.push(`${t.report}: ${run.report}`)
  return {
    type: 'monitor.alert',
    lines,
    data: {
      site: { url: run.url },
      scan: { id: run.scanId, score: run.facts.score, reportUrl: run.report },
      previous: run.facts.previousScore === null ? null : { score: run.facts.previousScore },
      events,
    },
    at,
  }
}

/** The summary of the runs a person had since the last one. */
export function summaryMessage(
  language: Language,
  runs: readonly RunInfo[],
  at: Date,
): AlertMessage {
  const t = ALERT_TEXT[language]
  const lines = [t.summaryTitle]
  for (const run of runs) {
    const site = siteLabel(run.url)
    const { facts } = run
    lines.push(
      facts.unreachable
        ? t.summaryDown(site)
        : t.summaryLine(
            site,
            facts.score,
            facts.score !== null && facts.previousScore !== null
              ? facts.score - facts.previousScore
              : null,
          ),
    )
    lines.push(`${t.report}: ${run.report}`)
  }
  return {
    type: 'monitor.summary',
    lines,
    data: {
      sites: runs.map((run) => ({
        url: run.url,
        score: run.facts.score,
        previousScore: run.facts.previousScore,
        unreachable: run.facts.unreachable,
        reportUrl: run.report,
      })),
    },
    at,
  }
}

/** One WhatsApp message: the template, its variables, and the key the run remembers it by. */
export interface WhatsAppJob {
  readonly key: string
  readonly template: WhatsAppTemplate
  readonly params: readonly string[]
}

/** The account page, in the person's language: where a stopped monitor is turned on again. */
export const accountUrl = (origin: string, language: Language): string =>
  `${origin}${language === 'en' ? '/en' : ''}/account`

/**
 * What a run's events say on WhatsApp: one approved template per event, with the same facts the
 * webhook and the mail carry. Never free text, and never the weekly summary: WhatsApp is for what
 * needs a person's attention now.
 */
export function whatsappJobs(
  origin: string,
  language: Language,
  run: RunInfo,
  events: readonly AlertEvent[],
): WhatsAppJob[] {
  const site = siteLabel(run.url)
  return events.map((event): WhatsAppJob => {
    switch (event.type) {
      case 'score-drop':
        return {
          key: 'whatsapp:score-drop',
          template: 'scoreDrop',
          params: [site, String(event.from), String(event.to), run.report],
        }
      case 'critical':
        return {
          key: 'whatsapp:critical',
          template: 'critical',
          params: [site, String(event.count), run.report],
        }
      case 'down':
        return { key: 'whatsapp:down', template: 'down', params: [site] }
      case 'paused':
        return {
          key: 'whatsapp:paused',
          template: 'paused',
          params: [site, accountUrl(origin, language)],
        }
    }
  })
}

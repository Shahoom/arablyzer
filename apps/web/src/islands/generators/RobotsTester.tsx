import { robotsTest, type RobotsTestResult } from '@arablyzer/generators'
import { GENERATORS_UI } from '@arablyzer/i18n/generators'
import type { Lang } from '@arablyzer/seo/site'
import type { TargetedSubmitEvent } from 'preact'
import { useState } from 'preact/hooks'
import { FIELD, LABEL, SUBMIT } from './CopyBox'

/**
 * Crawlers people ask about, by the product token their robots.txt groups name: the search
 * engines', the AI search crawlers, then the training ones (the robots-blocks-ai-search rule's).
 */
const CRAWLERS = [
  'Googlebot',
  'Bingbot',
  'OAI-SearchBot',
  'Claude-SearchBot',
  'PerplexityBot',
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
]

/** The robots.txt tester (M2.3b): a pasted file, judged by the robots rules' own code. */
export default function RobotsTester({ lang, tool }: { lang: Lang; tool: string }) {
  const t = GENERATORS_UI[lang].robots
  const common = GENERATORS_UI[lang].common
  const [result, setResult] = useState<RobotsTestResult | 'bad-url' | null>(null)
  const onSubmit = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (name: string) => {
      const entry = data.get(name)
      return typeof entry === 'string' ? entry : ''
    }
    try {
      const url = new URL(value('url').trim())
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new TypeError('scheme')
      setResult(robotsTest(value('robots'), url.href, value('crawler')))
    } catch {
      setResult('bad-url')
    }
  }
  return (
    <div className="flex flex-col gap-6" data-tool={tool}>
      <form onSubmit={onSubmit} data-tool-kind="paste" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="robots-file" className={LABEL}>
            {t.file}
          </label>
          <textarea
            id="robots-file"
            name="robots"
            rows={8}
            dir="ltr"
            spellcheck={false}
            required
            placeholder={'User-agent: *\nDisallow: /admin/'}
            className={`${FIELD} h-auto py-2.5 font-mono text-sm`}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <label htmlFor="robots-url" className={LABEL}>
              {t.url}
            </label>
            <input
              id="robots-url"
              name="url"
              type="url"
              dir="ltr"
              required
              placeholder="https://example.com/products/"
              className={`${FIELD} font-mono`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="robots-crawler" className={LABEL}>
              {t.crawler}
            </label>
            <select id="robots-crawler" name="crawler" dir="ltr" className={`${FIELD} font-mono`}>
              {CRAWLERS.map((crawler) => (
                <option key={crawler} value={crawler}>
                  {crawler}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" className={SUBMIT}>
          {t.submit}
        </button>
        <p className="m-0 text-sm text-ink-3">{common.local}</p>
      </form>
      {result === 'bad-url' ? (
        <p role="alert" className="m-0 text-sm text-signal">
          {t.badUrl}
        </p>
      ) : (
        result !== null && (
          <section
            aria-label={common.result}
            className={`flex flex-col gap-2 border-[1.5px] bg-white px-5 py-4 ${result.allowed ? 'border-pass' : 'border-signal'}`}
          >
            <p
              className={`m-0 text-lg font-semibold ${result.allowed ? 'text-pass' : 'text-signal'}`}
            >
              {result.allowed ? t.allowed : t.blocked}
            </p>
            <p className="m-0 text-sm text-ink-2">
              {result.rule === null ? (
                t.noRule
              ) : (
                <>
                  {t.rule}{' '}
                  <code dir="ltr" className="bg-paper px-1.5 font-mono">
                    {result.rule.text}
                  </code>{' '}
                  {t.line(result.rule.line)}
                </>
              )}
            </p>
            <p className="m-0 text-sm text-ink-3">{t.group[result.group]}</p>
          </section>
        )
      )}
    </div>
  )
}

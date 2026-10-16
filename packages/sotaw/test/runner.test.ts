import type { Report } from '@arablyzer/report-schema'
import { ScannerUnavailable, type PageAnswer } from '@arablyzer/scanner-client'
import { MemoryScanStore, type ScanJob } from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { LOWEST_PRIORITY, runnerConfigFrom, type RunnerConfig } from '../src/config'
import { createRunner, onDomain, type RunnerDeps } from '../src/runner'
import { MemorySotawStore } from '../src/store'
import { fakeReport } from './fixtures'

const RUN = 'sotaw-test'

const ok = (url: string): PageAnswer => ({
  outcome: 'ok',
  status: 200,
  finalUrl: url,
  error: null,
  title: null,
  links: [],
  skeleton: null,
  issues: [],
  score: null,
  crawlDelayMs: null,
})
const refused = (
  outcome: PageAnswer['outcome'],
  error: string | null,
  status: number | null = null,
): PageAnswer => ({
  ...ok('https://x/'),
  outcome,
  status,
  finalUrl: null,
  error,
})

interface Options {
  domains?: string[]
  config?: Partial<RunnerConfig>
  /** The visitors' scans waiting or running, by the time. */
  publicBusy?: (at: number) => number
  load?: (at: number) => number
  /** What the front page of each address says; a site that is not here answers ok. */
  pages?: Record<string, PageAnswer | Error>
  report?: (domain: string) => Report | 'fail'
  scanMs?: number
}

function harness(options: Options = {}) {
  let now = 1_000_000
  const scans = new MemoryScanStore()
  const store = new MemorySotawStore()
  const domains = options.domains ?? ['a.sa', 'b.sa', 'c.eg']
  const added: { job: ScanJob; priority: number; at: number }[] = []
  const timeline: { at: number; busy: number; loads: number }[] = []
  const finishAt = new Map<string, number>()
  const asked: string[] = []
  const config: RunnerConfig = {
    ...runnerConfigFrom({}, { seed: 'seed', optOut: new Set() }),
    intervalMs: 20_000,
    preflightMs: 0,
    pollMs: 5_000,
    ...options.config,
  }
  let maxInFlight = 0
  const ours = () => [...finishAt.keys()].filter((id) => !finished.has(id))
  const finished = new Set<string>()
  const worker = async () => {
    for (const [id, at] of finishAt) {
      if (finished.has(id) || at > now) continue
      finished.add(id)
      const domain = new URL(
        added.find((a) => a.job.id === id)?.job.url ?? 'https://x/',
      ).hostname.replace(/^www\./, '')
      const made = options.report?.(domain) ?? fakeReport({ 'ar-letter-spacing': 'pass' })
      if (made === 'fail') await scans.fail(id, new Date(now))
      else await scans.finish(id, made, new Date(now))
    }
  }
  const deps: RunnerDeps = {
    store,
    scans,
    queue: {
      busy: () => {
        timeline.push({ at: now, busy: options.publicBusy?.(now) ?? 0, loads: ours().length })
        return Promise.resolve((options.publicBusy?.(now) ?? 0) + ours().length)
      },
      add: async (job, { priority }) => {
        added.push({ job, priority, at: now })
        finishAt.set(job.id, now + (options.scanMs ?? 12_000))
        await scans.start(job.id, new Date(now))
        maxInFlight = Math.max(maxInFlight, ours().length)
      },
    },
    crawler: {
      page: (url) => {
        asked.push(url)
        const answer = options.pages?.[url] ?? options.pages?.[new URL(url).hostname] ?? ok(url)
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
      },
    },
    load: () => options.load?.(now) ?? 0.1,
    now: () => now,
    sleep: async (ms) => {
      now += ms
      if (now > 1_000_000 + 3_600_000 * 24) throw new Error('The crawl does not end')
      await worker()
    },
    newId: (() => {
      let n = 0
      return () => `scan${String(++n).padStart(18, '0')}`
    })(),
    log: () => undefined,
  }
  const start = async () =>
    store.start(
      { id: RUN, frameId: 'T', frameSha: 'f'.repeat(64), seed: 'seed' },
      domains.map((domain, position) => ({
        domain,
        country: domain.split('.')[1] ?? 'sa',
        rank: position + 1,
        position,
      })),
      new Date(now),
    )
  const run = async (signal = new AbortController().signal) => {
    await start()
    return createRunner(RUN, deps, config).run(signal)
  }
  return {
    run,
    start,
    store,
    scans,
    added,
    timeline,
    asked,
    deps,
    config,
    maxInFlight: () => maxInFlight,
    clock: () => now,
  }
}

describe('the crawl’s schedule', () => {
  it('queues each site’s homepage at the lowest priority, in Chromium alone', async () => {
    const h = harness()
    const summary = await h.run()
    expect(summary.stopped).toBe('finished')
    expect(h.added).toHaveLength(3)
    expect(h.added.every((a) => a.priority === LOWEST_PRIORITY)).toBe(true)
    expect(h.added.every((a) => a.job.engines?.join() === 'chromium')).toBe(true)
    expect(h.added.map((a) => a.job.url)).toEqual(
      expect.arrayContaining(['https://a.sa/', 'https://b.sa/', 'https://c.eg/']),
    )
  })

  it('draws a share of the sites in all three engines, chosen by the seeded hash', async () => {
    const all = harness({ config: { allEnginesShare: 1 } })
    await all.run()
    expect(all.added.every((a) => a.job.engines?.length === 3)).toBe(true)
    const none = harness({ config: { allEnginesShare: 0 } })
    await none.run()
    expect(none.added.every((a) => a.job.engines?.length === 1)).toBe(true)
    const part = harness({
      domains: Array.from({ length: 200 }, (_, i) => `s${String(i)}.sa`),
      config: { allEnginesShare: 0.25, intervalMs: 1000 },
    })
    await part.run()
    const three = part.added.filter((a) => a.job.engines?.length === 3).length
    expect(three).toBeGreaterThan(20)
    expect(three).toBeLessThan(90)
  })

  it('never starts a scan within the rate cap of the one before', async () => {
    const h = harness({ domains: ['a.sa', 'b.sa', 'c.sa', 'd.sa'], scanMs: 3_000 })
    await h.run()
    const gaps = h.added.slice(1).map((a, i) => a.at - (h.added[i]?.at ?? 0))
    expect(gaps).toHaveLength(3)
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(20_000)
  })

  it('has at most one scan in flight by default, and the number the setting says otherwise', async () => {
    const one = harness({
      domains: ['a.sa', 'b.sa', 'c.sa', 'd.sa'],
      config: { intervalMs: 1_000 },
      scanMs: 30_000,
    })
    await one.run()
    expect(one.maxInFlight()).toBe(1)
    const two = harness({
      domains: ['a.sa', 'b.sa', 'c.sa', 'd.sa'],
      config: { intervalMs: 1_000, concurrency: 2 },
      scanMs: 30_000,
    })
    await two.run()
    expect(two.maxInFlight()).toBe(2)
  })

  it('starts nothing while a visitor’s scan is waiting or running, and goes on when none is', async () => {
    const start = 1_000_000
    const h = harness({ publicBusy: (at) => (at < start + 60_000 ? 2 : 0) })
    const summary = await h.run()
    expect(summary.stopped).toBe('finished')
    expect(h.added[0]?.at).toBeGreaterThanOrEqual(start + 60_000)
    // Nothing was claimed or asked of a site while the queue was busy.
    expect(h.asked.length).toBeGreaterThan(0)
    const busyChecks = h.timeline.filter((t) => t.busy > 0)
    expect(busyChecks.length).toBeGreaterThan(5)
    expect(h.added.every((a) => (h.timeline.find((t) => t.at === a.at)?.busy ?? 0) === 0)).toBe(
      true,
    )
  })

  it('pauses when a visitor arrives between two sites', async () => {
    let visitor = false
    const h = harness({
      domains: ['a.sa', 'b.sa'],
      publicBusy: () => (visitor ? 1 : 0),
      scanMs: 5_000,
    })
    const inner = h.deps.queue
    let second: number | null = null
    ;(h.deps as { queue: RunnerDeps['queue'] }).queue = {
      busy: () => inner.busy(),
      add: async (job, o) => {
        await inner.add(job, o)
        if (h.added.length === 1) visitor = true
        else second = h.clock()
      },
    }
    // The visitor leaves a minute after the first scan began.
    const base = h.deps.sleep
    let left = false
    ;(h.deps as { sleep: RunnerDeps['sleep'] }).sleep = async (ms, signal) => {
      await base(ms, signal)
      if (!left && h.added[0] !== undefined && h.clock() - h.added[0].at > 60_000) {
        visitor = false
        left = true
      }
    }
    await h.run()
    expect(second).not.toBeNull()
    expect((second as unknown as number) - (h.added[0]?.at ?? 0)).toBeGreaterThan(60_000)
  })

  it('waits while the host is busy', async () => {
    const start = 1_000_000
    const h = harness({
      load: (at) => (at < start + 120_000 ? 0.9 : 0.1),
      config: { maxLoad: 0.5 },
    })
    await h.run()
    expect(h.added[0]?.at).toBeGreaterThanOrEqual(start + 120_000)
  })

  it('stops at the limit it was given, with the rest still to do', async () => {
    const h = harness({ domains: ['a.sa', 'b.sa', 'c.sa', 'd.sa'], config: { limit: 2 } })
    const summary = await h.run()
    expect(summary.stopped).toBe('limit')
    expect(summary.taken).toBe(2)
    expect(summary.counts.pending).toBe(2)
  })
})

describe('what the crawl does with a site', () => {
  it('keeps a compact outcome, and deletes the scan and its report', async () => {
    const h = harness({
      domains: ['a.sa'],
      report: () => fakeReport({ 'ar-letter-spacing': 'fail' }, { platform: 'salla' }),
    })
    await h.run()
    const [row] = await h.store.results(RUN)
    expect(row?.state).toBe('done')
    expect(row?.outcome?.rules).toEqual({ 'ar-letter-spacing': 'f' })
    expect(row?.outcome?.platform).toBe('salla')
    expect(row?.scanId).toBeNull()
    expect(await h.scans.get(h.added[0]?.job.id ?? '')).toBeNull()
    expect(JSON.stringify(row?.outcome)).not.toContain('a.sa')
  })

  it('skips a site that robots.txt keeps out, whoever it names, without a scan', async () => {
    const h = harness({
      domains: ['a.sa', 'b.sa', 'c.sa'],
      pages: {
        'a.sa': refused('blocked', 'robots'),
        'b.sa': refused('blocked', 'robots-unreachable'),
        'c.sa': refused('blocked', 'bot-challenge'),
      },
    })
    await h.run()
    const rows = await h.store.results(RUN)
    expect(rows.map((r) => [r.state, r.reason])).toEqual([
      ['skipped', 'robots'],
      ['skipped', 'robots-unreachable'],
      ['skipped', 'bot-challenge'],
    ])
    expect(h.added).toHaveLength(0)
  })

  it('tries http and then www for a site that does not answer, and does not for one that answers with an error', async () => {
    const h = harness({
      domains: ['a.sa', 'b.sa', 'c.sa'],
      pages: {
        'https://a.sa/': refused('error', 'dns'),
        'http://a.sa/': refused('error', 'dns'),
        'https://www.a.sa/': refused('error', 'dns'),
        'https://b.sa/': refused('error', 'http-403', 403),
        'https://c.sa/': refused('error', 'dns'),
        'http://c.sa/': refused('error', 'dns'),
        'https://www.c.sa/': ok('https://www.c.sa/'),
      },
    })
    await h.run()
    expect(h.asked).toEqual([
      'https://a.sa/',
      'http://a.sa/',
      'https://www.a.sa/',
      'https://b.sa/',
      'https://c.sa/',
      'http://c.sa/',
      'https://www.c.sa/',
    ])
    expect((await h.store.results(RUN)).map((r) => r.reason)).toEqual([
      'unreachable',
      'http-error',
      null,
    ])
    expect(h.added.map((a) => a.job.url)).toEqual(['https://www.c.sa/'])
  })

  it('leaves a site that moves to another domain, a file that is no page, and an opted-out site', async () => {
    const h = harness({
      domains: ['a.sa', 'b.sa', 'c.sa', 'd.sa'],
      config: { optOut: new Set(['d.sa']) },
      pages: {
        'a.sa': ok('https://elsewhere.com/'),
        'b.sa': refused('not-html', null, 200),
        'c.sa': ok('https://www.c.sa/home'),
      },
    })
    await h.run()
    expect((await h.store.results(RUN)).map((r) => r.reason ?? r.state)).toEqual([
      'off-domain',
      'not-html',
      'done',
      'opt-out',
    ])
    expect(h.asked).not.toContain('https://d.sa/')
  })

  it('does not count a bot challenge or an error page as a site judged', async () => {
    const h = harness({
      domains: ['a.sa', 'b.sa'],
      report: (domain) =>
        domain === 'a.sa'
          ? fakeReport({ 'bot-challenge': 'fail' }, { status: 'partial', score: null })
          : fakeReport({}, { status: 'failed', score: null, page: false }),
    })
    await h.run()
    expect((await h.store.results(RUN)).map((r) => [r.state, r.reason])).toEqual([
      ['skipped', 'bot-challenge'],
      ['skipped', 'no-page'],
    ])
  })

  it('tries a scan that failed once more, and then fails the site', async () => {
    const h = harness({ domains: ['a.sa'], report: () => 'fail' })
    await h.run()
    expect(h.added).toHaveLength(2)
    expect((await h.store.results(RUN)).map((r) => [r.state, r.reason, r.attempts])).toEqual([
      ['failed', 'scan-failed', 2],
    ])
  })

  it('fails a scan that takes longer than its time, and deletes it', async () => {
    const h = harness({
      domains: ['a.sa'],
      scanMs: 10 * 60_000,
      config: { scanTimeoutMs: 60_000, maxAttempts: 1 },
    })
    await h.run()
    expect((await h.store.results(RUN)).map((r) => [r.state, r.reason])).toEqual([
      ['failed', 'timeout'],
    ])
    expect(await h.scans.get(h.added[0]?.job.id ?? '')).toBeNull()
  })

  it('gives the attempt back when the scanner is not there', async () => {
    let tries = 0
    const h = harness({ domains: ['a.sa'] })
    ;(h.deps as { crawler: RunnerDeps['crawler'] }).crawler = {
      page: (url) =>
        ++tries === 1
          ? Promise.reject(new ScannerUnavailable('not there'))
          : Promise.resolve(ok(url)),
    }
    await h.run()
    const [row] = await h.store.results(RUN)
    expect(row?.state).toBe('done')
    expect(row?.attempts).toBe(1)
  })
})

describe('stopping and going on', () => {
  it('does not do a finished site again, and takes up the one a dead crawler left running', async () => {
    const first = harness({ domains: ['a.sa', 'b.sa', 'c.sa'], config: { limit: 1 } })
    await first.run()
    expect((await first.store.counts(RUN)).done).toBe(1)
    // A crawler that died with a site taken and its scan queued.
    const claimed = await first.store.claim(RUN)
    expect(claimed?.domain).toBe('b.sa')
    await first.scans.create({
      id: 'left'.padEnd(22, '0'),
      url: 'https://b.sa/',
      createdAt: new Date(),
      deleteTokenHash: 'x',
    })
    await first.store.attach(RUN, 'b.sa', 'left'.padEnd(22, '0'))
    const again = createRunner(RUN, first.deps, { ...first.config, limit: null })
    // The scan it left is finished by the worker meanwhile.
    await first.scans.start('left'.padEnd(22, '0'), new Date())
    await first.scans.finish(
      'left'.padEnd(22, '0'),
      fakeReport({ 'ar-letter-spacing': 'fail' }),
      new Date(),
    )
    const summary = await again.run(new AbortController().signal)
    expect(summary.stopped).toBe('finished')
    expect(summary.counts).toMatchObject({ done: 3, pending: 0, running: 0 })
    // a.sa was scanned once, b.sa by the scan left behind, c.sa once more.
    expect(first.added.map((a) => a.job.url)).toEqual(['https://a.sa/', 'https://c.sa/'])
    const b = (await first.store.results(RUN)).find((r) => r.domain === 'b.sa')
    expect(b?.outcome?.rules).toEqual({ 'ar-letter-spacing': 'f' })
  })

  it('puts back a site that was taken and has no scan, for the next time', async () => {
    const h = harness({ domains: ['a.sa'] })
    await h.start()
    await h.store.claim(RUN)
    const summary = await createRunner(RUN, h.deps, h.config).run(new AbortController().signal)
    expect(summary.stopped).toBe('finished')
    expect((await h.store.results(RUN))[0]?.attempts).toBe(1)
  })

  it('stops when told, leaving the site in hand running and its scan in the queue', async () => {
    const stop = new AbortController()
    const h = harness({ domains: ['a.sa', 'b.sa'], scanMs: 600_000 })
    const base = h.deps.sleep
    ;(h.deps as { sleep: RunnerDeps['sleep'] }).sleep = async (ms, signal) => {
      await base(ms, signal)
      if (h.added.length === 1) stop.abort()
    }
    const summary = await h.run(stop.signal)
    expect(summary.stopped).toBe('aborted')
    const rows = await h.store.results(RUN)
    expect(rows[0]).toMatchObject({ state: 'running', scanId: h.added[0]?.job.id })
    expect(rows[1]?.state).toBe('pending')
  })

  it('refuses to go on with a run that was made from another frame', async () => {
    const h = harness()
    await h.start()
    await expect(
      h.store.start(
        { id: RUN, frameId: 'T', frameSha: 'e'.repeat(64), seed: 'seed' },
        [],
        new Date(),
      ),
    ).rejects.toThrow(/another frame/)
  })
})

describe('the settings', () => {
  it('are the gentle ones by default', () => {
    const config = runnerConfigFrom({}, { seed: 's', optOut: new Set() })
    expect(config).toMatchObject({
      concurrency: 1,
      intervalMs: 20_000,
      engines: ['chromium'],
      allEnginesShare: 0,
      maxAttempts: 2,
      priority: LOWEST_PRIORITY,
      limit: null,
    })
  })

  it('read the environment, and refuse what is out of range', () => {
    const env = {
      ARABLYZER_SOTAW_CONCURRENCY: '2',
      ARABLYZER_SOTAW_INTERVAL_SECONDS: '45',
      ARABLYZER_SOTAW_ENGINES: 'chromium, webkit',
      ARABLYZER_SOTAW_ALL_ENGINES_SHARE: '0.1',
    }
    expect(runnerConfigFrom(env, { seed: 's', optOut: new Set() })).toMatchObject({
      concurrency: 2,
      intervalMs: 45_000,
      engines: ['chromium', 'webkit'],
      allEnginesShare: 0.1,
    })
    for (const bad of [
      { ARABLYZER_SOTAW_CONCURRENCY: '9' },
      { ARABLYZER_SOTAW_ENGINES: 'edge' },
      { ARABLYZER_SOTAW_MAX_LOAD: '2' },
      { ARABLYZER_SOTAW_INTERVAL_SECONDS: 'x' },
    ]) {
      expect(() => runnerConfigFrom(bad, { seed: 's', optOut: new Set() })).toThrow(
        /ARABLYZER_SOTAW/,
      )
    }
  })

  it('judge where a front page ended: the site’s own host or a subdomain', () => {
    expect(onDomain('https://www.a.sa/x', 'a.sa')).toBe(true)
    expect(onDomain('https://a.sa./', 'a.sa')).toBe(true)
    expect(onDomain('https://nota.sa/', 'a.sa')).toBe(false)
    expect(onDomain('not a url', 'a.sa')).toBe(false)
  })
})

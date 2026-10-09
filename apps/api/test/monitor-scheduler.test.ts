import { DEFAULT_POLICY, type Resolver } from '@arablyzer/egress'
import { DEVELOPMENT_ACCOUNT_PLAN, DEVELOPMENT_LIMITS, type PlanCatalog } from '@arablyzer/plans'
import type { Report } from '@arablyzer/report-schema'
import {
  MemoryAccountData,
  MemoryInFlight,
  MemoryMonitorData,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import {
  BACKOFF_MS,
  BATCH,
  createScheduler,
  MAX_ATTEMPTS,
  monitorQueueRoom,
  SUMMARY_EVERY_MS,
} from '../src/monitor/scheduler'
import { DAY_MS, MINUTE_MS } from '../src/monitor/schedule'
import type { AlertMessage, Delivery } from '../src/monitor/webhook'

const START = new Date('2026-10-09T12:00:00.000Z')
const ORIGIN = 'https://arablyzer.example'
const PUBLIC: Resolver = () => Promise.resolve([{ address: '93.184.215.14', family: 4 }])

const report = (
  score: number | null,
  criticals: string[] = [],
  status: 'complete' | 'partial' = 'complete',
) =>
  ({
    scan: { status },
    score: { overall: score },
    findings: criticals.map((fingerprint) => ({ severity: 'critical', fingerprint })),
  }) as unknown as Report

function setup(
  options: {
    plan?: Partial<typeof DEVELOPMENT_ACCOUNT_PLAN>
    resolver?: Resolver
    queueCap?: number
    hostScans?: number
    status?: () => number | null
  } = {},
) {
  let clock = START
  const scans = new MemoryScanStore()
  const accounts = new MemoryAccountData(scans)
  const monitors = new MemoryMonitorData(accounts, scans)
  const queue = new MemoryScanQueue()
  const events = new MemoryScanEvents(20)
  const inFlight = new MemoryInFlight()
  const limiter = new MemoryRateLimiter()
  const sent: AlertMessage[] = []
  const account = { ...DEVELOPMENT_ACCOUNT_PLAN, ...options.plan }
  const plans: PlanCatalog = { account, pro: null, agency: null }
  let n = 0
  const scheduler = createScheduler({
    monitors,
    store: scans,
    queue,
    events,
    limiter,
    inFlight,
    limits: {
      ...DEVELOPMENT_LIMITS,
      queue: options.queueCap ?? 10,
      perHost: { scans: options.hostScans ?? 100, seconds: 3600 },
    },
    plans,
    policy: DEFAULT_POLICY,
    resolver: options.resolver ?? PUBLIC,
    sender: {
      send: (_webhook, message): Promise<Delivery> => {
        sent.push(message)
        const status = options.status === undefined ? 204 : options.status()
        return Promise.resolve({ status, ok: status !== null && status < 300 })
      },
    },
    mail: { available: false, send: () => Promise.resolve(false) },
    origin: ORIGIN,
    newId: () => `scan${String(++n).padStart(18, '0')}`,
    now: () => clock,
    random: () => 0.5,
  })
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms)
  }
  const user = async (id: string, siteCount = 1) => {
    const sites: { id: string; url: string }[] = []
    for (let i = 0; i < siteCount; i++) {
      const site = {
        id: `${id}-site${String(i)}`.padEnd(22, '_'),
        url: `https://${id}${String(i)}.example/`,
        createdAt: new Date(START.getTime() + i),
      }
      await accounts.addSite(id, site, 10)
      sites.push(site)
    }
    return sites
  }
  const watch = async (
    userId: string,
    siteId: string,
    due = new Date(START.getTime() - MINUTE_MS),
    days = 7,
  ) => {
    const result = await monitors.enable(
      userId,
      siteId,
      { everyDays: days, nextRunAt: due, createdAt: START },
      99,
    )
    expect(result.kind).toBe('enabled')
  }
  /** Ends the scan the way the worker does. */
  const finish = async (scanId: string, ended: Report | 'fail') => {
    await scans.start(scanId, clock)
    if (ended === 'fail') await scans.fail(scanId, clock)
    else await scans.finish(scanId, ended, clock)
  }
  return {
    scheduler,
    monitors,
    accounts,
    scans,
    queue,
    inFlight,
    limiter,
    sent,
    advance,
    user,
    watch,
    finish,
    now: () => clock,
  }
}

describe('starting runs', () => {
  it('starts a due monitor like a person’s scan, records the run, and sets the next date by the interval', async () => {
    const { scheduler, monitors, accounts, scans, queue, inFlight, user, watch } = setup()
    const [site] = await user('ali')
    await watch('ali', site?.id ?? '')
    await scheduler.tick()
    const [run] = await monitors.pending(START, 5)
    expect(run?.url).toBe(site?.url)
    expect(await scans.get(run?.scanId ?? '')).toMatchObject({ state: 'queued', url: site?.url })
    expect(await queue.waiting()).toBe(1)
    expect((await accounts.history('ali', 5)).map((h) => h.siteId)).toEqual([site?.id])
    expect(await inFlight.held('account:ali')).toHaveLength(1)
    const monitor = await monitors.monitor('ali', site?.id ?? '')
    expect(monitor?.nextRunAt.getTime()).toBe(START.getTime() + 7 * DAY_MS)
    // Nothing is due now: another tick starts nothing.
    await scheduler.tick()
    expect(await queue.waiting()).toBe(1)
  })

  it('starts a slot once however many schedulers tick at once', async () => {
    const { scheduler, queue, user, watch } = setup()
    const [site] = await user('ali')
    await watch('ali', site?.id ?? '')
    await Promise.all([scheduler.tick(), scheduler.tick(), scheduler.tick()])
    expect(await queue.waiting()).toBe(1)
  })

  it('leaves visitors the queue’s upper half, and takes nothing it cannot start', async () => {
    const { scheduler, monitors, queue, user, watch } = setup({ queueCap: 4 })
    expect(monitorQueueRoom({ ...DEVELOPMENT_LIMITS, queue: 4 })).toBe(2)
    const sites = await user('ali', 1)
    const others = await Promise.all(['bo', 'cy', 'di'].map((id) => user(id)))
    await watch('ali', sites[0]?.id ?? '')
    for (const [index, [site]] of others.entries()) {
      await watch(['bo', 'cy', 'di'][index] ?? '', site?.id ?? '')
    }
    await scheduler.tick()
    // Room for two: two monitors started, two untouched and still due.
    expect(await queue.waiting()).toBe(2)
    const due = await monitors.claimDue(START, 10, new Date(START.getTime() + 1))
    expect(due).toHaveLength(2)
  })

  it('never starts more than a batch in one tick', async () => {
    const { scheduler, queue, user, watch } = setup({ queueCap: 100 })
    for (let i = 0; i < BATCH + 3; i++) {
      const [site] = await user(`u${String(i)}`)
      await watch(`u${String(i)}`, site?.id ?? '')
    }
    await scheduler.tick()
    expect(await queue.waiting()).toBe(BATCH)
  })

  it('defers while the person’s own scan holds their place, without losing the slot', async () => {
    const { scheduler, monitors, queue, inFlight, user, watch } = setup({ plan: { inFlight: 1 } })
    const [site] = await user('ali')
    await watch('ali', site?.id ?? '')
    expect(await inFlight.hold('account:ali', 'manual-scan', 1, START.getTime())).toBe(true)
    await scheduler.tick()
    expect(await queue.waiting()).toBe(0)
    const monitor = await monitors.monitor('ali', site?.id ?? '')
    expect(monitor?.nextRunAt.getTime()).toBeGreaterThan(START.getTime())
    expect(monitor?.nextRunAt.getTime()).toBeLessThan(START.getTime() + 20 * MINUTE_MS)
  })

  it('defers when the site’s host bucket is empty', async () => {
    const { scheduler, queue, limiter, user, watch } = setup({ hostScans: 2 })
    const [site] = await user('ali')
    await watch('ali', site?.id ?? '')
    const { hostLimitKey } = await import('@arablyzer/store')
    for (let i = 0; i < 2; i++) {
      await limiter.take(
        hostLimitKey(new URL(site?.url ?? '').hostname),
        { scans: 2, seconds: 3600 },
        START.getTime(),
      )
    }
    await scheduler.tick()
    expect(await queue.waiting()).toBe(0)
  })

  it('pauses the monitors past the plan and never runs them, and raises a short interval to the plan’s', async () => {
    const { scheduler, monitors, queue, user, watch } = setup({
      plan: { monitoredSites: 1, monitorEveryDays: 7 },
    })
    const [a, b] = await user('ali', 2)
    await watch('ali', a?.id ?? '', new Date(START.getTime() - MINUTE_MS), 1)
    await monitors.enable(
      'ali',
      b?.id ?? '',
      {
        everyDays: 1,
        nextRunAt: new Date(START.getTime() - 1),
        createdAt: new Date(START.getTime() + 1),
      },
      99,
    )
    await scheduler.tick()
    expect(await queue.waiting()).toBe(1)
    const state = await monitors.monitors('ali')
    expect(state.map((m) => m.paused)).toEqual([false, true])
    expect(state[0]?.everyDays).toBe(7)
    expect(state[0]?.nextRunAt.getTime()).toBe(START.getTime() + 7 * DAY_MS)
  })

  it('records a name that no longer resolves as a failed scan, and alerts that the site is down', async () => {
    const { scheduler, monitors, scans, queue, sent, user, watch } = setup({
      resolver: () => Promise.reject(new Error('nxdomain')),
    })
    const [site] = await user('ali')
    await watch('ali', site?.id ?? '')
    await monitors.saveAlerts('ali', {
      webhook: { url: 'https://hooks.example/x', secret: 's', kind: 'generic' },
    })
    await scheduler.tick()
    expect(await queue.waiting()).toBe(0)
    const [run] = await monitors.pending(START, 5)
    expect((await scans.get(run?.scanId ?? ''))?.state).toBe('failed')
    await scheduler.tick()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.data.events).toEqual([{ type: 'down' }])
    expect((await monitors.monitor('ali', site?.id ?? ''))?.failures).toBe(1)
  })
})

describe('alerts', () => {
  const HOOK = { url: 'https://hooks.example/x', secret: 's', kind: 'generic' } as const

  /** Runs one monitor scan to its end with the report, after an earlier finished scan. */
  async function ran(
    t: ReturnType<typeof setup>,
    before: Report | null,
    after: Report | 'fail',
    settings: Parameters<MemoryMonitorData['saveAlerts']>[1] = {},
  ) {
    const [site] = await t.user('ali')
    await t.monitors.saveAlerts('ali', { webhook: HOOK, ...settings })
    if (before !== null) {
      const id = 'before'.padEnd(22, '_')
      await t.scans.create({
        id,
        url: site?.url ?? '',
        createdAt: new Date(START.getTime() - 7 * DAY_MS),
      })
      await t.accounts.link({
        userId: 'ali',
        scanId: id,
        url: site?.url ?? '',
        source: 'manual',
        createdAt: new Date(START.getTime() - 7 * DAY_MS),
      })
      await t.finish(id, before)
    }
    await t.watch('ali', site?.id ?? '')
    await t.scheduler.tick()
    const [run] = await t.monitors.pending(START, 5)
    await t.finish(run?.scanId ?? '', after)
    t.advance(MINUTE_MS)
    return { site, scanId: run?.scanId ?? '' }
  }

  it('alerts a drop of the threshold or more, once, with the report’s link', async () => {
    const t = setup()
    const { scanId } = await ran(t, report(90), report(79))
    await t.scheduler.tick()
    await t.scheduler.tick()
    expect(t.sent).toHaveLength(1)
    expect(t.sent[0]?.data.events).toEqual([{ type: 'score-drop', from: 90, to: 79 }])
    expect(t.sent[0]?.lines.at(-1)).toContain(`${ORIGIN}/r/${scanId}`)
    expect(t.sent[0]?.type).toBe('monitor.alert')
  })

  it('says nothing for a smaller drop, a rise, or a first scan', async () => {
    const small = setup()
    await ran(small, report(90), report(81))
    await small.scheduler.tick()
    expect(small.sent).toHaveLength(0)
    const first = setup()
    await ran(first, null, report(40))
    await first.scheduler.tick()
    expect(first.sent).toHaveLength(0)
  })

  it('alerts new critical findings only, and honours the switch', async () => {
    const t = setup()
    await ran(
      t,
      report(90, ['aaaaaaaaaaaaaaaa']),
      report(88, ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', 'cccccccccccccccc']),
    )
    await t.scheduler.tick()
    expect(t.sent[0]?.data.events).toEqual([{ type: 'critical', count: 2 }])
    const off = setup()
    await ran(off, report(90), report(89, ['dddddddddddddddd']), { onCritical: false })
    await off.scheduler.tick()
    expect(off.sent).toHaveLength(0)
  })

  it('alerts a failed scan once, then stays quiet, and stops the monitor after repeated failures', async () => {
    const t = setup()
    const [site] = await t.user('ali')
    await t.monitors.saveAlerts('ali', { webhook: HOOK })
    await t.watch('ali', site?.id ?? '')
    const events: unknown[] = []
    for (let run = 1; run <= 5; run++) {
      await t.scheduler.tick()
      const pending = (await t.monitors.pending(t.now(), 5)).find((p) => p.state === 'queued')
      if (pending === undefined) break
      await t.finish(pending.scanId, 'fail')
      await t.scheduler.tick()
      events.push(t.sent.at(-1)?.data.events)
      // The next date is a week on: make it due again, as the clock would.
      await t.monitors.defer(site?.id ?? '', new Date(t.now().getTime() - 1))
      t.advance(MINUTE_MS)
    }
    expect(t.sent).toHaveLength(2)
    expect(t.sent[0]?.data.events).toEqual([{ type: 'down' }])
    expect(t.sent[1]?.data.events).toEqual([{ type: 'paused' }])
    const monitor = await t.monitors.monitor('ali', site?.id ?? '')
    expect(monitor).toMatchObject({ paused: true, failures: 4 })
    // Paused: nothing more starts.
    await t.monitors.defer(site?.id ?? '', new Date(t.now().getTime() - 1))
    const before = await t.queue.waiting()
    await t.scheduler.tick()
    expect(await t.queue.waiting()).toBe(before)
  })

  it('writes the message in the account’s language', async () => {
    const t = setup()
    t.monitors.languages.set('ali', 'en')
    await ran(t, report(90), report(50))
    await t.scheduler.tick()
    expect(t.sent[0]?.lines[0]).toBe('The score of ali0.example dropped from 90 to 50.')
    expect(t.sent[0]?.lines.at(-1)).toContain(`${ORIGIN}/en/r/`)
  })

  it('tries a failed delivery again after the backoff, then gives up', async () => {
    let status: number | null = 500
    const t = setup({ status: () => status })
    await ran(t, report(90), report(10))
    await t.scheduler.tick()
    expect(t.sent).toHaveLength(1)
    // Not before the first wait.
    t.advance(BACKOFF_MS[0] ?? 0)
    status = 204
    await t.scheduler.tick()
    expect(t.sent).toHaveLength(2)
    await t.scheduler.tick()
    expect(t.sent).toHaveLength(2)
    expect(await t.monitors.pending(t.now(), 5)).toEqual([])
  })

  it('gives up after the attempts, and turns the webhook off after five failures in a row', async () => {
    const t = setup({ status: () => 500 })
    await ran(t, report(90), report(10))
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      await t.scheduler.tick()
      t.advance(BACKOFF_MS.at(-1) ?? 0)
    }
    // Five failures turned it off, so the sixth try sent nothing.
    expect(t.sent).toHaveLength(5)
    const alerts = await t.monitors.alerts('ali')
    expect(alerts.webhook?.disabledAt).not.toBeNull()
    expect(await t.monitors.pending(t.now(), 5)).toEqual([])
  })

  it('sends the weekly summary when asked, at most once a week', async () => {
    const t = setup()
    await ran(t, report(90), report(88), { weeklySummary: true })
    await t.scheduler.tick()
    expect(t.sent.map((m) => m.type)).toEqual(['monitor.summary'])
    expect(t.sent[0]?.data.sites).toMatchObject([{ score: 88, previousScore: 90 }])
    expect((await t.monitors.alerts('ali')).lastSummaryAt).not.toBeNull()
    // A second run inside the week sends none.
    const [site] = await t.accounts.sites('ali')
    await t.monitors.defer(site?.id ?? '', new Date(t.now().getTime() - 1))
    await t.scheduler.tick()
    const pending = (await t.monitors.pending(t.now(), 5)).find((p) => p.state === 'queued')
    await t.finish(pending?.scanId ?? '', report(87))
    await t.scheduler.tick()
    expect(t.sent).toHaveLength(1)
    t.advance(SUMMARY_EVERY_MS)
    await t.monitors.defer(site?.id ?? '', new Date(t.now().getTime() - 1))
    await t.scheduler.tick()
    const again = (await t.monitors.pending(t.now(), 5)).find((p) => p.state === 'queued')
    await t.finish(again?.scanId ?? '', report(86))
    await t.scheduler.tick()
    expect(t.sent.map((m) => m.type)).toEqual(['monitor.summary', 'monitor.summary'])
  })

  it('sends nothing to a person with no webhook, and still moves the failure count', async () => {
    const t = setup()
    const [site] = await t.user('ali')
    await t.watch('ali', site?.id ?? '')
    await t.scheduler.tick()
    const [run] = await t.monitors.pending(t.now(), 5)
    await t.finish(run?.scanId ?? '', 'fail')
    await t.scheduler.tick()
    expect(t.sent).toHaveLength(0)
    expect((await t.monitors.monitor('ali', site?.id ?? ''))?.failures).toBe(1)
  })

  it('fails a scan that was never queued after an hour, and says the site could not be scanned', async () => {
    const t = setup()
    const [site] = await t.user('ali')
    await t.monitors.saveAlerts('ali', { webhook: HOOK })
    await t.watch('ali', site?.id ?? '')
    await t.scheduler.tick()
    const [run] = await t.monitors.pending(t.now(), 5)
    t.advance(61 * MINUTE_MS)
    await t.scheduler.tick()
    expect((await t.scans.get(run?.scanId ?? ''))?.state).toBe('failed')
    expect(t.sent[0]?.data.events).toEqual([{ type: 'down' }])
  })
})

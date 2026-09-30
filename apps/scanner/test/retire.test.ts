import rtlLayoutJson from '@arablyzer/fixtures/golden/reports/04-rtl-layout.json'
import { Report } from '@arablyzer/report-schema'
import { remoteScanner, ScannerUnavailable } from '@arablyzer/scanner-client'
import { serve } from '@hono/node-server'
import { describe, expect, it, vi } from 'vitest'
import { createScannerApp } from '../src/app'
import { MIN_UPTIME_MS, retireAfterAnswer } from '../src/retire'

const TOKEN = 'a-token-long-enough-to-be-the-workers-own'

/** A server that is closed but the way one is: it says when. */
function fakeServer() {
  const closes: (() => void)[] = []
  return {
    server: {
      close: (callback?: (error?: Error) => void) => {
        closes.push(() => callback?.())
        return undefined
      },
    },
    closes,
    /** The last connection ends, and the server's close callback is called. */
    finish: () => {
      for (const close of closes) close()
    },
  }
}

describe('retireAfterAnswer', () => {
  it('stops taking connections, and ends the process when the last one has gone', async () => {
    const exits: number[] = []
    const { server, closes, finish } = fakeServer()
    retireAfterAnswer(server, {
      exit: (code) => exits.push(code),
      uptimeMs: () => 60_000,
      graceMs: 5_000,
    })
    expect(closes).toHaveLength(1)
    // The answer is still being written: the process stays.
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(exits).toEqual([])
    finish()
    await vi.waitFor(() => {
      expect(exits).toEqual([0])
    })
  })

  it('lives out the rest of its minimum uptime first, so that Docker sees it start well', async () => {
    const exits: number[] = []
    const { server, finish } = fakeServer()
    const started = performance.now()
    let exitedAt = 0
    retireAfterAnswer(server, {
      exit: (code) => {
        exits.push(code)
        exitedAt = performance.now()
      },
      // Up for 100 ms of a 400.
      uptimeMs: () => 100,
      minUptimeMs: 400,
      graceMs: 5_000,
    })
    finish()
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(exits).toEqual([])
    await vi.waitFor(() => {
      expect(exits).toEqual([0])
    })
    // The 300 ms that were left, within a timer's error.
    expect(exitedAt - started).toBeGreaterThanOrEqual(280)
  })

  it('ends the process after its grace when a connection will not go', async () => {
    const exits: number[] = []
    // Its close callback is never called: a connection that stays.
    retireAfterAnswer(
      { close: () => undefined },
      { exit: (code) => exits.push(code), uptimeMs: () => 60_000, graceMs: 100 },
    )
    expect(exits).toEqual([])
    await vi.waitFor(() => {
      expect(exits).toEqual([0])
    })
  })

  it('ends it once, however often it is asked and however it is closed', async () => {
    const exits: number[] = []
    const { server, finish } = fakeServer()
    const options = {
      exit: (code: number) => exits.push(code),
      uptimeMs: () => 60_000,
      graceMs: 100,
    }
    retireAfterAnswer(server, options)
    retireAfterAnswer(server, options)
    finish()
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(exits).toEqual([0])
  })

  it('states a minimum uptime that clears the ten seconds after which Docker restarts at once', () => {
    // Docker doubles the pause before it restarts a container, from 100 ms to a minute, for as long
    // as the container lives under ten seconds: a scanner that serves one scan quickly would
    // otherwise wait a minute for each.
    expect(MIN_UPTIME_MS).toBeGreaterThan(10_000)
    expect(MIN_UPTIME_MS).toBeLessThanOrEqual(15_000)
  })
})

describe('a scanner that ends its process after its scan, on a real connection', () => {
  it('sends the whole answer first, and then refuses connections, as a scanner that is not there', async () => {
    const report = Report.parse(rtlLayoutJson)
    const exits: number[] = []
    let closed: (() => void) | undefined
    const ended = new Promise<void>((resolve) => {
      closed = resolve
    })
    let server: ReturnType<typeof serve> | undefined
    const app = createScannerApp({
      token: TOKEN,
      scanner: () => Promise.resolve(report),
      onServed: () => {
        if (server === undefined) throw new Error('No server yet')
        retireAfterAnswer(server, {
          exit: (code) => {
            exits.push(code)
            closed?.()
          },
          uptimeMs: () => 60_000,
          // Far longer than the test: only the connection's end can end the process here.
          graceMs: 60_000,
        })
      },
    })
    const port = await new Promise<number>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
        resolve(info.port)
      })
    })
    const scanner = remoteScanner(`http://127.0.0.1:${String(port)}`, TOKEN)
    // The report arrives whole, though the scanner is already going.
    expect(await scanner({ url: 'https://example.com/' }, () => undefined)).toEqual(report)
    // The process ends when the connection has, and a connection that asked to close does so at
    // once: an idle one would have kept the server open until a keep-alive timed out (3 s here).
    const received = performance.now()
    await ended
    expect(performance.now() - received).toBeLessThan(1_000)
    expect(exits).toEqual([0])
    // Nothing listens any more: a real refused connection, which the worker reads as "not there".
    await expect(scanner({ url: 'https://example.com/' }, () => undefined)).rejects.toBeInstanceOf(
      ScannerUnavailable,
    )
  })
})

import { ApiError } from '@arablyzer/integrations-core'
import { describe, expect, it } from 'vitest'
import { removeKey, save, test, type Form } from '../src/options-flow'
import { fakeClient, KEY, mockChrome } from './mock-chrome'

const form = (extra: Partial<Form> = {}): Form => ({
  apiKey: KEY,
  host: 'https://arablyzer.com',
  lang: 'auto',
  ...extra,
})

function setup(
  options: Parameters<typeof mockChrome>[0] = {},
  script: Parameters<typeof fakeClient>[0] = {},
) {
  const mock = mockChrome(options)
  const fake = fakeClient(script)
  return { mock, fake, deps: { chrome: mock.chrome, makeClient: () => fake.client } }
}

describe('the options page', () => {
  it('saves a good key to synced storage, with no permission asked for the default service', async () => {
    const { deps, mock } = setup()
    expect(await save(deps, form({ lang: 'en' }))).toEqual({ ok: true, done: 'saved' })
    expect(mock.sync.data).toEqual({ apiKey: KEY, host: 'https://arablyzer.com', lang: 'en' })
    expect(mock.calls.requested).toEqual([])
  })

  it('refuses a key or an address of the wrong shape, saving nothing', async () => {
    const { deps, mock } = setup()
    expect(await save(deps, form({ apiKey: 'arb_nope' }))).toEqual({ ok: false, problem: 'badKey' })
    expect(await save(deps, form({ host: 'http://arablyzer.example' }))).toEqual({
      ok: false,
      problem: 'badHost',
    })
    expect(mock.sync.data).toEqual({})
  })

  it('asks Chrome for another service’s address alone, and saves only if it is granted', async () => {
    const asked = setup({ allowRequest: true })
    expect(await save(asked.deps, form({ host: 'https://arablyzer.example/x' }))).toEqual({
      ok: true,
      done: 'saved',
    })
    expect(asked.mock.calls.requested).toEqual([['https://arablyzer.example/*']])
    expect(asked.mock.sync.data.host).toBe('https://arablyzer.example')

    const denied = setup({ allowRequest: false })
    expect(await save(denied.deps, form({ host: 'https://arablyzer.example' }))).toEqual({
      ok: false,
      problem: 'permission',
    })
    expect(denied.mock.sync.data).toEqual({})
  })

  it('an empty key is saved as no key', async () => {
    const { deps, mock } = setup({ sync: { apiKey: KEY } })
    expect(await save(deps, form({ apiKey: '' }))).toEqual({ ok: true, done: 'saved' })
    expect('apiKey' in mock.sync.data).toBe(false)
  })

  it('tests the typed key with a free read, and says why it fails', async () => {
    const ok = setup()
    expect(await test(ok.deps, form())).toEqual({ ok: true, done: 'testOk' })
    expect(ok.fake.calls).toEqual(['check'])

    const bad = setup({}, { check: () => Promise.reject(new ApiError('unauthorized', 'x', 401)) })
    expect(await test(bad.deps, form())).toEqual({ ok: false, problem: 'unauthorized' })
    const down = setup({}, { check: () => Promise.reject(new ApiError('network', 'x', 0)) })
    expect(await test(down.deps, form())).toEqual({ ok: false, problem: 'network' })

    const none = setup()
    expect(await test(none.deps, form({ apiKey: '' }))).toEqual({ ok: false, problem: 'noKey' })
    expect(await test(none.deps, form({ apiKey: 'x' }))).toEqual({ ok: false, problem: 'badKey' })
    expect(none.fake.calls).toEqual([])
  })

  it('removes the key and keeps the other settings', async () => {
    const { deps, mock } = setup({ sync: { apiKey: KEY, lang: 'en' } })
    expect(await removeKey(deps, form({ lang: 'en' }))).toEqual({ ok: true, done: 'removed' })
    expect(mock.sync.data).toEqual({ host: 'https://arablyzer.com', lang: 'en' })
  })
})

import { describe, expect, it } from 'vitest'
import {
  admit,
  DEFAULT_MAX_HOSTS,
  newBudget,
  pageRequests,
  READ_METHODS,
  refuseSocket,
  type RequestBudget,
} from '../../src/requests'

const SITE = 'https://shop.example/'

/** Asks about each request in turn, as the route does, and lists what became of them. */
function verdicts(budget: RequestBudget, ...requests: readonly (readonly [string, string])[]) {
  return requests.map(([method, url]) => admit(budget, method, url))
}

describe('the requests a page may make', () => {
  it('lets out GET and HEAD, and nothing else, whatever the destination (M1 review)', () => {
    expect([...READ_METHODS].sort()).toEqual(['GET', 'HEAD'])
    const budget = newBudget(300, DEFAULT_MAX_HOSTS)
    expect(
      verdicts(
        budget,
        ['GET', SITE],
        ['HEAD', SITE],
        ['POST', SITE],
        ['PUT', 'https://elsewhere.example/'],
        ['PATCH', SITE],
        ['DELETE', SITE],
        ['OPTIONS', SITE],
        ['PROPFIND', SITE],
        // A method is compared as the browser reports it: no other spelling gets through.
        ['get', SITE],
        ['Head', SITE],
        ['', SITE],
      ),
    ).toEqual([
      'allow',
      'allow',
      'sending',
      'sending',
      'sending',
      'sending',
      'sending',
      'sending',
      'sending',
      'sending',
      'sending',
    ])
  })

  it('counts every one it was asked about, and those refused for sending data apart', () => {
    const budget = newBudget(300, DEFAULT_MAX_HOSTS)
    verdicts(budget, ['GET', SITE], ['POST', SITE], ['POST', SITE], ['HEAD', SITE])
    refuseSocket(budget)
    expect(pageRequests(budget)).toEqual({ made: 5, overLimit: 0, overHosts: 0, sending: 3 })
    expect(budget.sent).toBe(2)
    expect(budget.reached).toBe(false)
  })

  it('does not spend the request limit, or a host, on a request that sends data', () => {
    const budget = newBudget(2, 1)
    expect(
      verdicts(
        budget,
        ['POST', 'https://a.example/'],
        ['POST', 'https://b.example/'],
        ['POST', 'https://c.example/'],
        ['GET', 'https://d.example/'],
        ['GET', 'https://d.example/again'],
      ),
    ).toEqual(['sending', 'sending', 'sending', 'allow', 'allow'])
    expect([...budget.hosts]).toEqual(['d.example'])
  })

  it('refuses a request past the limit, and sets the flag the report turns into a notice', () => {
    const budget = newBudget(3, DEFAULT_MAX_HOSTS)
    expect(
      verdicts(
        budget,
        ...Array.from({ length: 6 }, (_, i): [string, string] => ['GET', `${SITE}${String(i)}`]),
      ),
    ).toEqual(['allow', 'allow', 'allow', 'limit', 'limit', 'limit'])
    expect(pageRequests(budget)).toEqual({ made: 6, overLimit: 3, overHosts: 0, sending: 0 })
    expect(budget.reached).toBe(true)
    // What was let out is `made` less what was refused, as the browser test counts it.
    expect(budget.sent).toBe(3)
  })

  it('keeps the request limit for the requests let out, so refusals beside it do not use it up', () => {
    const budget = newBudget(3, DEFAULT_MAX_HOSTS)
    expect(
      verdicts(
        budget,
        ['POST', SITE],
        ['GET', `${SITE}1`],
        ['POST', SITE],
        ['GET', `${SITE}2`],
        ['GET', `${SITE}3`],
        ['GET', `${SITE}4`],
      ),
    ).toEqual(['sending', 'allow', 'sending', 'allow', 'allow', 'limit'])
  })
})

describe('the hosts a page may contact', () => {
  it('states its limit, a number of our own', () => {
    expect(DEFAULT_MAX_HOSTS).toBe(50)
  })

  it('lets a request to a host already contacted through, and refuses a host past the limit', () => {
    const budget = newBudget(300, 2)
    expect(
      verdicts(
        budget,
        ['GET', 'https://a.example/'],
        ['GET', 'https://b.example/'],
        ['GET', 'https://c.example/'],
        ['GET', 'https://a.example/more'],
        ['HEAD', 'https://b.example/more'],
        ['GET', 'https://d.example/'],
      ),
    ).toEqual(['allow', 'allow', 'hosts', 'allow', 'allow', 'hosts'])
    expect(pageRequests(budget)).toEqual({ made: 6, overLimit: 0, overHosts: 2, sending: 0 })
    // The limit of hosts is not the limit of requests: it says nothing of the page's loading in full.
    expect(budget.reached).toBe(false)
  })

  it('counts a host by its name as the browser resolves it: not by its port, its case or its path', () => {
    const budget = newBudget(300, 1)
    expect(
      verdicts(
        budget,
        ['GET', 'https://Shop.Example/a'],
        ['GET', 'http://shop.example:8080/b'],
        ['GET', 'https://shop.example/d?x=1#y'],
        ['GET', 'https://cdn.shop.example/e'],
      ),
    ).toEqual(['allow', 'allow', 'allow', 'hosts'])
  })

  it('counts an address as a host, in whatever spelling the URL gives it', () => {
    const budget = newBudget(300, 1)
    expect(
      verdicts(
        budget,
        ['GET', 'http://127.0.0.1/'],
        ['GET', 'http://2130706433/'],
        ['GET', 'http://0x7f.1/'],
        ['GET', 'http://[::1]/'],
      ),
    ).toEqual(['allow', 'allow', 'allow', 'hosts'])
  })

  it('does not count a URL that reaches no host, and does count one that does not parse', () => {
    const budget = newBudget(300, 1)
    expect(
      verdicts(
        budget,
        ['GET', 'data:text/plain,hello'],
        ['GET', 'blob:https://shop.example/1c6e-1'],
        ['GET', 'https://a.example/'],
        ['GET', 'https://b.example/'],
        ['GET', 'not a url'],
      ),
    ).toEqual(['allow', 'allow', 'allow', 'hosts', 'hosts'])
    expect([...budget.hosts]).toEqual(['a.example'])
  })

  it('remembers only the host of a request it let out', () => {
    // The limit of requests came first: the second host was refused for that, and never held a place.
    const budget = newBudget(1, 2)
    expect(verdicts(budget, ['GET', 'https://a.example/'], ['GET', 'https://b.example/'])).toEqual([
      'allow',
      'limit',
    ])
    expect([...budget.hosts]).toEqual(['a.example'])
  })
})

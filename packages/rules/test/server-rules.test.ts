import { describe, expect, it } from 'vitest'
import { RULES, ruleById, SERVER_RESPONSE_RULES } from '../src/index'

describe('SERVER_RESPONSE_RULES', () => {
  it('names rules that exist', () => {
    for (const id of SERVER_RESPONSE_RULES) expect(ruleById(id), id).toBeDefined()
  })

  it('has every rule that reads the connection, the redirects or the answer alone', () => {
    const responseOnly = RULES.filter(
      (rule) =>
        rule.needs.length > 0 &&
        rule.needs.every((need) => need === 'http' || need === 'redirects' || need === 'response'),
    )
    expect(responseOnly.length).toBeGreaterThan(0)
    for (const rule of responseOnly) expect(SERVER_RESPONSE_RULES.has(rule.id), rule.id).toBe(true)
  })
})

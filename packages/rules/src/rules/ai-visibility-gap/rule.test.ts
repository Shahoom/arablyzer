import type { AiVisibilityFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence } from '../../../test/helpers'
import type { Evidence } from '../../rule'
import { rule } from './rule'

const answer = (mentioned: boolean, cited: boolean, competitors: string[] = []) => ({
  question: 'ما أفضل متجر قهوة؟',
  status: 'answered' as const,
  mentioned,
  cited,
  citations: [],
  competitors,
})
const facts = (
  providers: Extract<AiVisibilityFacts, { outcome: 'checked' }>['providers'],
): AiVisibilityFacts => ({
  outcome: 'checked',
  brand: 'الواحة',
  domain: 'alwaha.com.sa',
  questions: ['ما أفضل متجر قهوة؟'],
  providers,
  calls: 4,
})
const withFacts = async (value: AiVisibilityFacts): Promise<Evidence> => ({
  ...(await fixtureEvidence(rule.id, 'wrong')),
  outside: { aiVisibility: value },
})

describe('ai-visibility-gap', () => {
  it('names an assistant that never mentions the site, and one that mentions it but never cites it', async () => {
    const evidence = await withFacts(
      facts([
        {
          provider: 'openai',
          model: 'm',
          status: 'ok',
          answers: [
            answer(false, false, ['a.com', 'b.com']),
            answer(false, false, ['b.com', 'c.com']),
          ],
        },
        {
          provider: 'anthropic',
          model: 'm',
          status: 'ok',
          answers: [answer(true, false), answer(true, false)],
        },
        { provider: 'gemini', model: 'm', status: 'ok', answers: [answer(true, true)] },
        {
          provider: 'perplexity',
          model: 'm',
          status: 'refused',
          answers: [{ ...answer(false, false), status: 'failed' }],
        },
      ]),
    )
    expect(applies(rule, evidence)).toBe(true)
    const findings = detectAll(rule, evidence)
    expect(findings.map((finding) => [finding.message, finding.values?.provider])).toEqual([
      ['absent', 'OpenAI'],
      ['uncited', 'Claude'],
    ])
    expect(findings[0]?.values).toMatchObject({ answered: 2, competitors: 'a.com, b.com, c.com' })
  })

  it('passes when every assistant cites the site, and does not apply with no answer', async () => {
    const good = await withFacts(
      facts([{ provider: 'gemini', model: 'm', status: 'ok', answers: [answer(true, true)] }]),
    )
    expect(detectAll(rule, good)).toEqual([])
    expect(applies(rule, await withFacts({ outcome: 'failed', statuses: [] }))).toBe(false)
    expect(applies(rule, await withFacts({ outcome: 'no-questions' }))).toBe(false)
    expect(applies(rule, await fixtureEvidence(rule.id, 'right'))).toBe(false)
  })
})

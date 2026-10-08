import type { AiProviderId } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'absent' | 'uncited'

const NAMES: Readonly<Record<AiProviderId, string>> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  anthropic: 'Claude',
}

/**
 * Whether the AI assistants with a key name the site when asked, in Arabic, the questions its own
 * page raises (docs/design/plans/arabic-native.md §13). For each assistant that answered: `absent`
 * when none of its answers mentions the brand or the domain (the competitors it cites are named),
 * `uncited` when the brand is mentioned and the domain is never among the sources it cites. Asked
 * only in a tool's scan, with a key (needs `ai-visibility`). Minor: an assistant's answers change,
 * and are not the site's to command.
 */
export const rule = defineRule({
  id: 'ai-visibility-gap',
  version: '1.0.0',
  category: 'ai',
  severity: 'minor',
  needs: ['ai-visibility'],
  messages: ['absent', 'uncited'],
  appliesTo: (_page, evidence) => {
    const facts = evidence?.outside?.aiVisibility
    return (
      facts?.outcome === 'checked' &&
      facts.providers.some((item) => item.answers.some((answer) => answer.status === 'answered'))
    )
  },
  detect: ({ outside }): DetectorFinding<Message>[] => {
    const facts = outside?.aiVisibility
    if (facts?.outcome !== 'checked') return []
    return facts.providers.flatMap((provider): DetectorFinding<Message>[] => {
      const answered = provider.answers.filter((answer) => answer.status === 'answered')
      if (answered.length === 0) return []
      const mentioned = answered.filter((answer) => answer.mentioned).length
      const cited = answered.filter((answer) => answer.cited).length
      const base = {
        provider: NAMES[provider.provider],
        answered: answered.length,
        mentioned,
      }
      if (mentioned === 0) {
        const competitors = [...new Set(answered.flatMap((answer) => answer.competitors))].slice(
          0,
          5,
        )
        return [
          {
            message: 'absent',
            values: { ...base, competitors: competitors.join(', ') },
            key: provider.provider,
          },
        ]
      }
      if (cited === 0) {
        return [{ message: 'uncited', values: base, key: provider.provider }]
      }
      return []
    })
  },
})

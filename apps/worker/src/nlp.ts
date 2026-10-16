import type { NlpCheckResponse, NlpTextJob, NlpTextResult } from '@arablyzer/api-contract/codes'
import { askNlpTexts, type NlpFacts, type NlpOptions } from '@arablyzer/collectors'

/** The slips a visitor who asks for the wider net sees: the service's own floor is 0.5; 0.7 is "likely". */
export const SURE = 0.9
export const WIDE = 0.7

const percent = (value: number) => Math.round(value * 100)

/** The facts as the text tools' answer: whole percents, no offsets. */
export function answerOf(job: NlpTextJob, facts: NlpFacts): NlpCheckResponse | null {
  if (job.kind === 'spelling') {
    const spelling = facts.spelling
    if (spelling === null) return null
    return {
      kind: 'spelling',
      findings: spelling.findings.map((finding) => ({
        word: finding.word,
        suggestion: finding.suggestion,
        family: finding.family,
        confidence: percent(finding.confidence),
        before: finding.before,
        after: finding.after,
        alternatives: [...finding.alternatives],
      })),
      words: spelling.words,
      judged: spelling.judged,
      truncated: spelling.truncated,
      minConfidence: percent(spelling.minConfidence),
    }
  }
  const dialect = facts.dialect
  if (dialect === null) return null
  const shares = (values: Readonly<Record<string, number>>, scale: (value: number) => number) => ({
    msa: scale(values.msa ?? 0),
    gulf: scale(values.gulf ?? 0),
    egyptian: scale(values.egyptian ?? 0),
    levantine: scale(values.levantine ?? 0),
    maghrebi: scale(values.maghrebi ?? 0),
  })
  return {
    kind: 'dialect',
    label: dialect.label,
    probabilities: shares(dialect.probabilities, percent),
    votes: shares(dialect.votes, (value) => value),
    chunks: dialect.chunks,
    words: dialect.words,
    truncated: dialect.truncated,
  }
}

/**
 * What the worker does with a pasted text: asks the Arabic NLP service, and answers the queue. A
 * service that is away is an answer too (`ok: false`), never an error that fails the job. The text
 * is the visitor's own and is logged nowhere.
 */
export function nlpTextHandler(options: NlpOptions): (job: NlpTextJob) => Promise<NlpTextResult> {
  return async (job) => {
    const run = await askNlpTexts(
      job.texts,
      { ...options, minConfidence: job.sensitivity === 'wide' ? WIDE : SURE },
      { spelling: job.kind === 'spelling', dialect: job.kind === 'dialect' },
    )
    const answer = run.facts === undefined ? null : answerOf(job, run.facts)
    return answer === null ? { ok: false } : { ok: true, answer }
  }
}

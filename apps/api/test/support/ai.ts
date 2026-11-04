import type { Report } from '@arablyzer/report-schema'
import type Anthropic from '@anthropic-ai/sdk'
import type { ModelClient } from '../../src/ai/client'

// Reports with one failed rule, and a model that answers from a script: enough for the fix
// assistant, and not valid reports.

export interface EvidenceSpec {
  readonly message?: string
  readonly url?: string
  readonly selector?: string
  readonly snippet?: string
  readonly line?: number
  readonly engines?: ('chromium' | 'firefox' | 'webkit')[]
  readonly values?: Record<string, unknown>
}

export function ruleReport(
  ruleId: string,
  findings: readonly EvidenceSpec[],
  options: {
    status?: 'fail' | 'pass' | 'needs-review' | 'not-applicable'
    version?: string
    title?: string
    severity?: string
    category?: string
  } = {},
): Report {
  return {
    generator: { name: 'arablyzer', version: '1.0.0', rulesetVersion: '1.0.0' },
    target: { url: 'https://shop.example/' },
    scan: { status: 'complete', render: [] },
    score: { overall: 71 },
    rules: [
      {
        id: ruleId,
        version: options.version ?? '1.0.0',
        category: options.category ?? 'onpage',
        severity: options.severity ?? 'serious',
        status: options.status ?? 'fail',
        title: { ar: `قاعدة ${ruleId}`, en: options.title ?? `Rule ${ruleId}` },
      },
    ],
    findings: findings.map((spec, index) => ({
      ruleId,
      severity: options.severity ?? 'serious',
      fingerprint: String(index).padEnd(16, 'a'),
      message: { ar: `ar ${ruleId}`, en: spec.message ?? `en ${ruleId}` },
      evidence: {
        ...(spec.url === undefined ? {} : { url: spec.url }),
        ...(spec.selector === undefined ? {} : { selector: spec.selector }),
        ...(spec.snippet === undefined ? {} : { snippet: spec.snippet }),
        ...(spec.line === undefined ? {} : { location: { line: spec.line } }),
        ...(spec.engines === undefined ? {} : { engines: spec.engines }),
        ...(spec.values === undefined ? {} : { values: spec.values }),
      },
    })),
  } as unknown as Report
}

/** The answer a good model gives: JSON in the required form, in Arabic or English. */
export function answerJson(language: 'ar' | 'en', overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    explanation_ar: language === 'ar' ? 'أضف نصاً بديلاً للصورة.' : '',
    explanation_en: language === 'en' ? 'Add alt text to the image.' : '',
    steps: ['Open the template.', 'Add an alt attribute.'],
    patch: '<img src="/a.png" alt="Product photo">',
    confidence: 'high',
    ...overrides,
  })
}

export interface MessageSpec {
  readonly text?: string
  readonly stop?: Anthropic.Message['stop_reason']
  readonly usage?: Partial<Anthropic.Usage>
}

/** The model's message, with the fields the assistant reads. */
export function messageOf(spec: MessageSpec): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: spec.text === undefined ? [] : [{ type: 'text', text: spec.text, citations: null }],
    stop_reason: spec.stop ?? 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      ...spec.usage,
    },
  } as unknown as Anthropic.Message
}

export type Script = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Anthropic.Message | Error

/** A model client that answers from `script` and remembers every request it was sent. */
export function scriptedModel(script: Script) {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = []
  const client: ModelClient = {
    messages: {
      create: (params) => {
        requests.push(params)
        const answer = script(params)
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
      },
    },
  }
  return { client, requests }
}

/** The value, or a failure of the test: for what the test has just put there. */
export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a value')
  return value
}

/** The text of the one user message a request holds. */
export function userText(params: Anthropic.MessageCreateParamsNonStreaming): string {
  const content = params.messages[0]?.content
  return typeof content === 'string' ? content : ''
}

/** The answer a good model gives to the request: in the language it names. */
export const goodModel: Script = (params) =>
  messageOf({ text: answerJson(userText(params).includes('(ar)') ? 'ar' : 'en') })

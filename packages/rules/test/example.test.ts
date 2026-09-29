import { describe, expect, it } from 'vitest'
import { parseRuleExample } from '../src/example'

const fence = (info: string, code: string) => `\`\`\`${info}\n${code}\n\`\`\``

describe('parseRuleExample', () => {
  it('reads the wrong and the right code, and their language', () => {
    const example = parseRuleExample(
      `${fence('html wrong', '<title>   </title>')}\n\n${fence('html right', '<title>بخور ظفار</title>')}\n`,
      'example.md',
    )
    expect(example).toEqual({
      lang: 'html',
      wrong: '<title>   </title>',
      right: '<title>بخور ظفار</title>',
    })
  })

  it('keeps the code as written, indentation and blank lines included', () => {
    const code = '.menu {\n  left: 0;\n\n  margin-left: 1rem;\n}'
    const example = parseRuleExample(
      `${fence('css wrong', code)}\n${fence('css right', '.menu {\n  inset-inline-start: 0;\n}')}`,
      'example.md',
    )
    expect(example.wrong).toBe(code)
  })

  it('refuses what the page cannot show', () => {
    const right = fence('html right', '<p>نص</p>')
    const cases: [string, RegExp][] = [
      [right, /no wrong example/],
      [fence('html wrong', '<p>نص</p>'), /no right example/],
      [`${fence('html wrong', 'a')}\n${fence('css right', 'b')}`, /same language/],
      [`${fence('xml wrong', 'a')}\n${fence('xml right', 'b')}`, /language "xml"/],
      [`${fence('html wrong', 'a')}\n${fence('html wrong', 'b')}`, /wrong example twice/],
      [`${fence('html', 'a')}\n${right}`, /"html wrong" or "html right"/],
      [`${fence('html wrong', '')}\n${right}`, /wrong example is empty/],
      [`text\n${fence('html wrong', 'a')}\n${right}`, /outside the code/],
      [`${fence('html wrong', 'a')}\n${right.slice(0, -3)}`, /not closed/],
    ]
    for (const [markdown, message] of cases) {
      expect(() => parseRuleExample(markdown, 'example.md')).toThrow(message)
    }
  })
})

import { firstGarbledRun } from '../../lib/mojibake'
import { whatsAppText } from '../../lib/whatsapp'
import { defineRule, type DetectorFinding } from '../../rule'

type Message =
  'double-encoded' | 'invalid-utf8' | 'bad-escape' | 'garbled' | 'hash-truncates' | 'template'

/** Placeholders a template leaves unfilled: {{name}}, ${name}, {name}, [[name]]. */
const TEMPLATE = /\{\{[^}]*\}\}|\$\{[^}]*\}|\{[A-Za-z_][\w.-]*\}|\[\[[^\]]*\]\]/

/** The bytes a text's percent escapes stand for, with the other characters as UTF-8; null for a stray %. */
function bytesOf(text: string): Uint8Array | null {
  const bytes: number[] = []
  const encoder = new TextEncoder()
  for (let index = 0; index < text.length;) {
    const char = text.charAt(index)
    if (char === '%') {
      const hex = text.slice(index + 1, index + 3)
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return null
      bytes.push(parseInt(hex, 16))
      index += 3
    } else {
      const point = text.codePointAt(index) ?? 0
      const length = point > 0xffff ? 2 : 1
      bytes.push(...encoder.encode(text.slice(index, index + length)))
      index += length
    }
  }
  return Uint8Array.from(bytes)
}

/**
 * M6.1: the ready-made message of a WhatsApp link (`?text=`), where an Arabic message goes wrong:
 * encoded twice (%25D9…), encoded in another encoding than UTF-8 (Windows-1256 bytes), a lone %,
 * a message that arrives garbled, a raw # that ends the address and drops the rest, and a
 * template's placeholder left in. Each is found in the link as written; the number is the business
 * of whatsapp-link-format.
 */
export const rule = defineRule({
  id: 'whatsapp-text-encoding',
  version: '1.0.0',
  category: 'forms',
  severity: 'moderate',
  needs: ['html'],
  messages: [
    'double-encoded',
    'invalid-utf8',
    'bad-escape',
    'garbled',
    'hash-truncates',
    'template',
  ],
  appliesTo: (page) =>
    (page.html?.anchors ?? []).some((anchor) => whatsAppText(anchor.href) !== null),
  detect: ({ page }) =>
    (page.html?.anchors ?? []).flatMap((anchor): DetectorFinding<Message>[] => {
      const found = whatsAppText(anchor.href)
      if (found === null) return []
      const where = {
        selector: anchor.selector,
        ...(anchor.snippet === null ? {} : { snippet: anchor.snippet }),
        ...(anchor.location === null ? {} : { location: anchor.location }),
        key: anchor.href,
      }
      const shown = found.text.length > 80 ? `${found.text.slice(0, 80)}…` : found.text
      const problem = (
        message: Message,
        values: Record<string, string> = {},
      ): DetectorFinding<Message>[] => [{ message, values: { text: shown, ...values }, ...where }]
      if (found.fragment !== '') {
        return problem('hash-truncates', { lost: found.fragment.slice(0, 40) })
      }
      if (/%25[0-9A-Fa-f]{2}/.test(found.text)) return problem('double-encoded')
      const bytes = bytesOf(found.text)
      if (bytes === null) return problem('bad-escape')
      let decoded: string
      try {
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        return problem('invalid-utf8')
      }
      const garbled = firstGarbledRun(decoded)
      if (garbled !== null) return problem('garbled', { sample: garbled.found })
      const template = TEMPLATE.exec(decoded)
      if (template !== null) return problem('template', { placeholder: template[0] })
      return []
    }),
})

import { LOGO_TYPES, MAX_BRAND_NAME, PDF_KINDS } from '@arablyzer/api-contract'
import { z } from 'zod'

// The document a PDF is drawn from (M4.7). It is built in the API's image from a report, already in
// the reader's language, and sent to the scanner, which draws it in its browser. The scanner takes
// it as data, never as markup: every field is plain text with a cap, so what a scanned site wrote
// (a title, a snippet) cannot be anything but text on a page.

const text = (max: number) => z.string().max(max)
const Severity = z.enum(['critical', 'serious', 'moderate', 'minor', 'info'])
export type PdfSeverity = z.infer<typeof Severity>
const Tone = z.enum(['good', 'bad', 'neutral'])

/** The blocks that can sit inside another (a finding's fix steps). */
const Simple = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('p'), text: text(2_000) }),
  z.strictObject({
    t: z.literal('list'),
    ordered: z.boolean(),
    items: z.array(text(1_500)).max(60),
  }),
  z.strictObject({ t: z.literal('code'), text: text(3_000) }),
])

const Block = z.discriminatedUnion('t', [
  ...Simple.options,
  z.strictObject({
    t: z.literal('stats'),
    items: z
      .array(z.strictObject({ label: text(80), value: text(40), tone: Tone.optional() }))
      .max(12),
  }),
  z.strictObject({
    t: z.literal('table'),
    head: z.array(text(80)).max(8),
    rows: z.array(z.array(text(400)).max(8)).max(150),
  }),
  z.strictObject({
    t: z.literal('image'),
    src: z
      .string()
      .max(120_000)
      .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
    alt: text(300),
    caption: text(300),
  }),
  z.strictObject({
    t: z.literal('issue'),
    severity: Severity,
    /** The severity in words (the chip says it, not colour alone). */
    chip: text(40),
    title: text(300),
    meta: text(300).optional(),
    lines: z.array(text(600)).max(14),
    fixLabel: text(60).optional(),
    fix: z.array(Simple).max(30),
  }),
])
export type Block = z.infer<typeof Block>

export const PdfBrand = z.strictObject({
  name: text(MAX_BRAND_NAME),
  /** `#rrggbb`, already past the contrast check. */
  color: z.string().regex(/^#[0-9a-f]{6}$/),
  logo: z
    .strictObject({
      type: z.enum(LOGO_TYPES),
      /** The image, base64; the logo is at most 200 KB. */
      data: z
        .string()
        .max(280_000)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .nullable(),
  /** The small line under the company's mark: empty when the plan has removed it. */
  credit: text(80),
})
export type PdfBrand = z.infer<typeof PdfBrand>

export const PdfDocument = z.strictObject({
  v: z.literal(1),
  lang: z.enum(['ar', 'en']),
  kind: z.enum(PDF_KINDS),
  /** The file's title (what a PDF reader shows). */
  title: text(300),
  /** Null: Arablyzer's own mark. */
  brand: PdfBrand.nullable(),
  /** "Arablyzer" for the mark of an unbranded document. */
  mark: text(40),
  cover: z.strictObject({
    kicker: text(120),
    heading: text(300),
    sub: text(300),
    score: z.number().int().min(0).max(100).nullable(),
    scoreLabel: text(80),
    scoreNote: text(200),
    facts: z.array(z.strictObject({ label: text(80), value: text(300) })).max(10),
  }),
  sections: z
    .array(
      z.strictObject({
        heading: text(200),
        blocks: z.array(Block).max(500),
      }),
    )
    .max(40),
  /** The words of the footer: the page numbering's "of" and the line at the foot of each page. */
  footer: z.strictObject({ line: text(160), of: text(20) }),
})
export type PdfDocument = z.infer<typeof PdfDocument>

/** The most a document may weigh as JSON: the scanner reads no more, and the API builds no more. */
export const MAX_DOCUMENT_BYTES = 6 * 1024 * 1024

import {
  FIX_GUIDES,
  FIX_SCHEMA,
  GLOSSARY,
  TERM_SCHEMA,
  type DocumentCopy,
  type DocumentSchema,
  type Lang,
} from '@arablyzer/guides'
import { renderInline, renderMarkdown } from '@arablyzer/seo/markdown'
import { fixHtml } from '../src/lib/fix-html'
import type { DocCopyData, GuidesData } from '../src/lib/guide-data'

// The /fix guides and the glossary as their pages need them (M2.4d), for src/generated/
// guides.json: generate.ts writes it.

function copyData<K extends string>(
  copy: DocumentCopy<K>,
  schema: DocumentSchema<K>,
  lang: Lang,
): DocCopyData {
  const html = (markdown: string) => fixHtml(renderMarkdown(markdown))
  return {
    title: copy.title,
    description: copy.description,
    // The questions have their own list; their section's heading is the page's.
    sections: schema.order.flatMap((key) => {
      const markdown = copy.sections[key]
      if (markdown === undefined) return []
      return [
        { key, title: schema.headings[lang][key], html: key === schema.faq ? '' : html(markdown) },
      ]
    }),
    faq: copy.faq.map((entry) => ({
      question: renderInline(entry.question),
      answer: html(entry.answer),
    })),
  }
}

export function guidesData(): GuidesData {
  return {
    fix: FIX_GUIDES.map((guide) => ({
      slug: guide.slug,
      status: guide.status,
      message: guide.message,
      tools: [...guide.tools],
      rules: [...guide.rules],
      related: [...guide.related],
      updated: guide.updated,
      copy: {
        ar: copyData(guide.copy.ar, FIX_SCHEMA, 'ar'),
        en: copyData(guide.copy.en, FIX_SCHEMA, 'en'),
      },
    })),
    glossary: GLOSSARY.map((term) => ({
      slug: term.slug,
      term: term.term,
      tools: [...term.tools],
      rules: [...term.rules],
      guides: [...term.guides],
      related: [...term.related],
      updated: term.updated,
      copy: {
        ar: copyData(term.copy.ar, TERM_SCHEMA, 'ar'),
        en: copyData(term.copy.en, TERM_SCHEMA, 'en'),
      },
    })),
  }
}

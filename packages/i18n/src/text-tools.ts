import type { Copy } from './copy'

/**
 * The generators and paste tools made of a form and an answer (M10.1, TextTool): what their forms
 * ask and what they answer, a block for each tool. They run in the visitor's browser: nothing
 * typed leaves it. The shared words (copy, copied, result) are GENERATORS_UI's.
 */
export interface TextToolsStrings {
  readonly slug: {
    readonly title: string
    readonly titleHint: string
    readonly base: string
    readonly baseHint: string
    readonly submit: string
    readonly slug: string
    readonly encoded: string
    readonly url: string
    readonly empty: string
    readonly badBase: string
    readonly truncated: string
    readonly marks: string
    readonly digits: string
    readonly clean: string
  }
  readonly errors: {
    readonly message: string
    readonly hint: string
    readonly submit: string
    readonly empty: string
    readonly cause: string
    readonly fix: string
    readonly tool: string
    readonly unknown: string
    readonly known: string
  }
  readonly title: {
    readonly title: string
    readonly hint: string
    readonly submit: string
    readonly fixed: string
    readonly empty: string
    readonly unchanged: string
    readonly length: (count: number, max: number) => string
    readonly changes: Readonly<Record<'tatweel' | 'promotion' | 'caps' | 'spaces' | 'long', string>>
  }
}

export const TEXT_TOOLS_UI: Copy<TextToolsStrings> = {
  reviewed: false,
  ar: {
    slug: {
      title: 'عنوان الصفحة',
      titleHint: 'اكتبه كما هو، بالعربية أو الإنجليزية، وبحركاته إن كانت فيه.',
      base: 'بداية العنوان (اختيارية)',
      baseHint: 'مثل https://example.com/products/ لنعرض العنوان كاملاً.',
      submit: 'اكتب الجزء',
      slug: 'الجزء كما يظهر في شريط العنوان',
      encoded: 'الجزء كما يُرسل (مرمَّز)',
      url: 'العنوان كاملاً',
      empty: 'لا حرف ولا رقم في هذا العنوان. اكتب كلمة واحدة على الأقل.',
      badBase: 'بداية العنوان ليست رابطاً يبدأ بـ https:// أو http://.',
      truncated: 'العنوان أطول من 100 حرف، فقُطع عند آخر كلمة تامة تتسع له.',
      marks: 'حُذفت الحركات والتطويل من العنوان: الكلمة بها وبدونها عنوانان.',
      digits: 'حُوّلت الأرقام العربية الشرقية إلى 0–9.',
      clean: 'الجزء يجتاز فحص الأجزاء في Arablyzer: بلا علامات ولا فواصل غريبة، وفي الحد.',
    },
    errors: {
      message: 'نص الرسالة',
      hint: 'الصق الرسالة من Search Console أو Merchant Center كما تظهر لك، بالعربية أو الإنجليزية.',
      submit: 'فسّر الرسالة',
      empty: 'الصق نص الرسالة.',
      cause: 'السبب المعتاد',
      fix: 'ما الذي تفعله',
      tool: 'افحص صفحتك بالأداة المناسبة',
      unknown:
        'لم نتعرف على هذه الرسالة. ألصق عنوانها كما يظهر في Search Console، أو اختر من الرسائل التي نعرفها.',
      known: 'الرسائل التي نعرفها',
    },
    title: {
      title: 'عنوان المنتج',
      hint: 'كما هو في متجرك أو ملف المنتجات، عربياً أو إنجليزياً.',
      submit: 'أصلح العنوان',
      fixed: 'العنوان بعد الإصلاح',
      empty: 'اكتب عنوان المنتج.',
      unchanged: 'لا شيء يستدعي الإصلاح: العنوان نظيف بحسب ما نفحصه.',
      length: (count, max) => `طول العنوان ${String(count)} حرفاً، والحد الأعلى ${String(max)}.`,
      changes: {
        tatweel: 'حُذف التطويل من الكلمات العربية.',
        promotion:
          'حُذف العرض من العنوان (الشحن المجاني أو الخصم أو نحوه): مكانه حقول السعر والشحن في الملف.',
        caps: 'كُتبت الأحرف الإنجليزية الكبيرة كلمات عادية.',
        spaces: 'ضُغطت المسافات الزائدة.',
        long: 'العنوان أطول من الحد، فقُطع عند آخر كلمة تامة.',
      },
    },
  },
  en: {
    slug: {
      title: 'Page title',
      titleHint: 'Type it as it is, in Arabic or English, with its harakat if it has any.',
      base: 'Start of the address (optional)',
      baseHint: 'Such as https://example.com/products/, to see the whole address.',
      submit: 'Write the slug',
      slug: 'The slug as the address bar shows it',
      encoded: 'The slug as it is sent (encoded)',
      url: 'The whole address',
      empty: 'There is no letter or digit in this title. Type at least one word.',
      badBase: 'The start of the address is not a link beginning with https:// or http://.',
      truncated:
        'The title is longer than 100 characters, so it stops at the last whole word that fits.',
      marks:
        'The harakat and tatweel were taken out: a word with them and without them is two addresses.',
      digits: 'Eastern Arabic digits were turned into 0–9.',
      clean:
        'The slug passes Arablyzer’s slug check: no marks, no odd separators, within the limit.',
    },
    errors: {
      message: 'The message',
      hint: 'Paste the message from Search Console or Merchant Center as it shows, in Arabic or English.',
      submit: 'Explain the message',
      empty: 'Paste the message.',
      cause: 'The usual cause',
      fix: 'What to do',
      tool: 'Check your page with the matching tool',
      unknown:
        'We did not recognise this message. Paste its heading as Search Console shows it, or pick from the ones we know.',
      known: 'The messages we know',
    },
    title: {
      title: 'Product title',
      hint: 'As it is in your store or product file, in Arabic or English.',
      submit: 'Fix the title',
      fixed: 'The title after the fix',
      empty: 'Type the product’s title.',
      unchanged: 'Nothing to fix: the title is clean as far as we check.',
      length: (count, max) =>
        `The title is ${String(count)} characters; the limit is ${String(max)}.`,
      changes: {
        tatweel: 'Tatweel was taken out of the Arabic words.',
        promotion:
          'The offer was taken out of the title (free shipping, a discount and the like): its place is the price and shipping fields of the file.',
        caps: 'Capital English letters were written as ordinary words.',
        spaces: 'Extra spaces were squeezed.',
        long: 'The title was over the limit, so it stops at the last whole word.',
      },
    },
  },
}

import type { Copy } from './copy'

/**
 * The words of the Arabic-native features' cards (docs/design/plans/arabic-native.md): the font
 * slimmer's downloads, the spelling search test, the country fit and the Arabic X-ray. Arabic is
 * the original and awaits the owner's review.
 */
export interface NativeStrings {
  readonly fonts: {
    readonly title: string
    readonly intro: string
    readonly file: string
    readonly now: string
    readonly subset: string
    readonly saves: (kb: string, percent: number) => string
    readonly download: string
    readonly downloadHint: string
    readonly snippet: string
    readonly unused: string
    readonly failed: string
    readonly limited: string
    readonly none: string
    readonly pending: string
  }
}

export const NATIVE: Copy<NativeStrings> = {
  reviewed: false,
  ar: {
    fonts: {
      title: 'الخطوط العربية في الصفحة',
      intro:
        'لكل خط ويب عربي حمّلته الصفحة: حجم ملفه، وحجم نسخة مخفّفة بالحروف التي يعرضها نص الصفحة. تُصنع النسخة حين تضغط التنزيل، ولا نحتفظ بها.',
      file: 'الملف',
      now: 'حجمه الآن',
      subset: 'نسخة مخفّفة',
      saves: (kb, percent) => `توفّر ${kb} (${percent}٪)`,
      download: 'نزّل النسخة (WOFF2)',
      downloadHint: 'تُصنع من ملف الخط على موقعك وتُرسل إليك دون تخزين.',
      snippet: 'قاعدة @font-face الجاهزة',
      unused: 'لا نص عربي في الصفحة يستخدم هذا الخط، فلا نسخة له.',
      failed: 'تعذّر صنع النسخة الآن. حاول بعد قليل.',
      limited: 'طلبت نسخًا كثيرة في وقت قصير. انتظر قليلًا.',
      none: 'لم تحمّل الصفحة خطوط ويب عربية نقرؤها.',
      pending: 'نصنع النسخة…',
    },
  },
  en: {
    fonts: {
      title: "The page's Arabic fonts",
      intro:
        'For each Arabic web font the page loaded: the size of its file, and of a subset holding only the letters its text shows. The subset is made when you press download, and we do not keep it.',
      file: 'File',
      now: 'Size now',
      subset: 'Subset',
      saves: (kb, percent) => `saves ${kb} (${percent}%)`,
      download: 'Download the subset (WOFF2)',
      downloadHint: 'Made from the font file on your site and sent to you, not stored.',
      snippet: 'The @font-face rule, ready',
      unused: 'No Arabic text on the page uses this font, so it has no subset.',
      failed: 'The subset could not be made now. Try again shortly.',
      limited: 'You asked for many subsets in a short time. Wait a little.',
      none: 'The page loaded no Arabic web fonts we can read.',
      pending: 'Making the subset…',
    },
  },
}

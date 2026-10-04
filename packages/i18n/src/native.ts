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
  readonly search: {
    readonly title: string
    readonly summary: (lost: number, total: number) => string
    readonly clean: (total: number) => string
    readonly via: Readonly<Record<'form' | 'wordpress' | 'platform', string>>
    readonly requests: (count: number) => string
    readonly word: string
    readonly asked: string
    readonly found: (count: number) => string
    readonly kinds: Readonly<
      Record<'ta-marbuta' | 'alef' | 'ya' | 'tatweel' | 'diacritics' | 'digits' | 'arabizi', string>
    >
    readonly outcomes: Readonly<Record<'same' | 'differs' | 'lost' | 'unanswered', string>>
    readonly notCounted: string
    readonly floor: string
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
    search: {
      title: 'ما فعله بحث موقعك',
      summary: (lost, total) => `بحثكم يضيّع ${String(lost)} من ${String(total)} تنويعًا إملائيًا`,
      clean: (total) => `بحثكم وجد كل ${String(total)} من التنويعات التي جرّبناها`,
      via: {
        form: 'وجدنا البحث في نموذج الصفحة',
        wordpress: 'لم نجد نموذجًا، فسألنا عنوان بحث ووردبريس (?s=)',
        platform: 'لم نجد نموذجًا، فسألنا عنوان بحث المنصة المعروف',
      },
      requests: (count) => `${String(count)} طلبًا، شاملةً طلبًا واحدًا لاستعلام لا معنى له`,
      word: 'الكلمة',
      asked: 'ما سألنا عنه',
      found: (count) => `${String(count)} نتيجة`,
      kinds: {
        'ta-marbuta': 'ة ↔ ه',
        alef: 'همزة الألف',
        ya: 'ى ↔ ي',
        tatweel: 'تطويل',
        diacritics: 'تشكيل',
        digits: 'أرقام الكتابة الأخرى',
        arabizi: 'عربيزي (لا يُحسب)',
      },
      outcomes: {
        same: 'كالأصل',
        differs: 'مختلف قليلًا',
        lost: 'ضاع',
        unanswered: 'بلا جواب',
      },
      notCounted: 'يُعرض ولا يدخل في العدّ',
      floor: 'عدد النتائج هو ما تعرضه الصفحة الأولى من الجواب، فهو حدٌّ أدنى.',
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
    search: {
      title: 'What your site search did',
      summary: (lost, total) =>
        `Your search loses ${String(lost)} of ${String(total)} spelling variants`,
      clean: (total) => `Your search found all ${String(total)} variants we tried`,
      via: {
        form: 'We found the search in a form on the page',
        wordpress: 'No form found, so we asked WordPress’s search address (?s=)',
        platform: 'No form found, so we asked the platform’s known search address',
      },
      requests: (count) => `${String(count)} requests, one of them a query that means nothing`,
      word: 'Word',
      asked: 'Asked',
      found: (count) => `${String(count)} ${count === 1 ? 'result' : 'results'}`,
      kinds: {
        'ta-marbuta': 'ة ↔ ه',
        alef: 'Alef’s hamza',
        ya: 'ى ↔ ي',
        tatweel: 'Tatweel',
        diacritics: 'Diacritic',
        digits: 'Other script’s digits',
        arabizi: 'Arabizi (not counted)',
      },
      outcomes: {
        same: 'as the word',
        differs: 'slightly different',
        lost: 'lost',
        unanswered: 'no answer',
      },
      notCounted: 'Shown, not counted',
      floor: 'The number of results is what the first page of the answer shows, so it is a floor.',
    },
  },
}

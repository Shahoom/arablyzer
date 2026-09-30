import type { Copy } from './copy'

/**
 * The generators and the paste tool (M2.3b): what their forms ask and what they answer. They run
 * in the visitor's browser: nothing typed leaves it.
 */
export interface GeneratorsStrings {
  readonly common: {
    readonly copy: string
    readonly copied: string
    /** Under a generator's form: where it runs. */
    readonly local: string
    readonly result: string
  }
  readonly whatsapp: {
    readonly country: string
    /** The option for a number typed with its country code. */
    readonly international: string
    readonly countries: Readonly<Record<string, string>>
    readonly number: string
    readonly text: string
    readonly textHint: string
    readonly label: string
    readonly labelDefault: string
    readonly submit: string
    readonly link: string
    readonly html: string
    readonly open: string
    readonly problems: Readonly<
      Record<
        'arabic-digits' | 'not-digits-only' | 'leading-zero' | 'not-international' | 'trunk-zero',
        string
      >
    >
  }
  readonly hreflang: {
    readonly url: string
    readonly code: string
    readonly add: string
    readonly remove: string
    readonly xDefault: string
    readonly xDefaultHint: string
    readonly submit: string
    readonly html: string
    readonly problem: (code: string, suggestion: string | null) => string
  }
  readonly schema: {
    readonly name: string
    readonly price: string
    readonly currency: string
    readonly availability: string
    readonly availabilities: Readonly<Record<'InStock' | 'OutOfStock' | 'PreOrder', string>>
    readonly url: string
    readonly image: string
    readonly sku: string
    readonly brand: string
    readonly description: string
    readonly optional: string
    readonly submit: string
    readonly html: string
    readonly problems: Readonly<Record<'price' | 'currency' | 'name', string>>
  }
  readonly robots: {
    readonly file: string
    readonly url: string
    readonly crawler: string
    readonly submit: string
    readonly allowed: string
    readonly blocked: string
    /** Before the rule's code, and after it. */
    readonly rule: string
    readonly line: (line: number) => string
    readonly noRule: string
    readonly group: Readonly<Record<'specific' | 'global' | 'none', string>>
    readonly badUrl: string
  }
}

export const GENERATORS_UI: Copy<GeneratorsStrings> = {
  reviewed: false,
  ar: {
    common: {
      copy: 'انسخ',
      copied: 'نُسخ',
      local: 'مجاني وبلا تسجيل، ويعمل في متصفحك: لا يغادره شيء مما تكتبه.',
      result: 'النتيجة',
    },
    whatsapp: {
      country: 'رمز الدولة',
      international: 'الرقم مكتوب برمز دولته',
      countries: {
        '968': 'عُمان (968)',
        '966': 'السعودية (966)',
        '971': 'الإمارات (971)',
        '965': 'الكويت (965)',
        '973': 'البحرين (973)',
        '974': 'قطر (974)',
      },
      number: 'رقم واتساب',
      text: 'رسالة أولى (اختيارية)',
      textHint: 'تظهر مكتوبة في المحادثة، ويرسلها الزائر إن شاء.',
      label: 'نص الرابط في صفحتك',
      labelDefault: 'راسلنا على واتساب',
      submit: 'أنشئ الرابط',
      link: 'الرابط',
      html: 'كود الرابط',
      open: 'جرّب الرابط',
      problems: {
        'arabic-digits': 'في الرقم أرقام عربية: حُوّلت إلى 0–9.',
        'not-digits-only': 'في الرقم رموز غير الأرقام: حُذفت.',
        'leading-zero': 'يبدأ الرقم بصفر: حُذف.',
        'not-international':
          'لم نتعرف على الرقم برمز دولة: اختر الدولة، أو اكتب الرقم كاملاً برمزها.',
        'trunk-zero': 'بعد رمز الدولة صفر لا يُكتب في الرقم الدولي: حُذف.',
      },
    },
    hreflang: {
      url: 'رابط النسخة',
      code: 'رمز اللغة والبلد',
      add: 'أضف نسخة',
      remove: 'احذف',
      xDefault: 'رابط x-default (اختياري)',
      xDefaultHint:
        'الصفحة التي تناسب من لا تطابق لغته أي نسخة، وهي عادةً العربية أو صفحة اختيار اللغة.',
      submit: 'أنشئ الوسوم',
      html: 'الوسوم، لتضعها في كل النسخ',
      problem: (code, suggestion) =>
        suggestion === null
          ? `الرمز ${code} لا يقبله Google.`
          : `الرمز ${code} لا يقبله Google، والصحيح ${suggestion}.`,
    },
    schema: {
      name: 'اسم المنتج',
      price: 'السعر',
      currency: 'العملة',
      availability: 'التوفر',
      availabilities: { InStock: 'متوفر', OutOfStock: 'غير متوفر', PreOrder: 'طلب مسبق' },
      url: 'رابط صفحة المنتج',
      image: 'رابط الصورة',
      sku: 'رمز المنتج (SKU)',
      brand: 'العلامة التجارية',
      description: 'الوصف',
      optional: 'اختياري',
      submit: 'أنشئ الكود',
      html: 'الكود، لتضعه في صفحة المنتج',
      problems: {
        price: 'اكتب السعر رقماً، بنقطة أو فاصلة عشرية عربية، بلا رمز عملة.',
        currency: 'اختر العملة من القائمة.',
        name: 'اكتب اسم المنتج.',
      },
    },
    robots: {
      file: 'محتوى ملف robots.txt',
      url: 'الرابط الذي تريد اختباره',
      crawler: 'الزاحف',
      submit: 'اختبر',
      allowed: 'مسموح: يستطيع الزاحف الوصول إلى هذا الرابط.',
      blocked: 'ممنوع: لا يستطيع الزاحف الوصول إلى هذا الرابط.',
      rule: 'القاعدة التي حكمت:',
      line: (line) => `في السطر ${String(line)}.`,
      noRule: 'لا قاعدة تطابق هذا الرابط، فهو مسموح.',
      group: {
        specific: 'حكمت مجموعة الزاحف نفسه.',
        global: 'لا مجموعة باسم الزاحف، فحكمت مجموعة *.',
        none: 'لا مجموعة في الملف تخص هذا الزاحف.',
      },
      badUrl: 'اكتب رابطاً كاملاً يبدأ بـ https://',
    },
  },
  en: {
    common: {
      copy: 'Copy',
      copied: 'Copied',
      local: 'Free, no sign-up, and it runs in your browser: nothing you type leaves it.',
      result: 'Result',
    },
    whatsapp: {
      country: 'Country code',
      international: 'The number has its country code',
      countries: {
        '968': 'Oman (968)',
        '966': 'Saudi Arabia (966)',
        '971': 'UAE (971)',
        '965': 'Kuwait (965)',
        '973': 'Bahrain (973)',
        '974': 'Qatar (974)',
      },
      number: 'WhatsApp number',
      text: 'First message (optional)',
      textHint: 'It shows typed in the chat, and the visitor sends it if they wish.',
      label: "The link's words on your page",
      labelDefault: 'Message us on WhatsApp',
      submit: 'Make the link',
      link: 'Link',
      html: "The link's code",
      open: 'Try the link',
      problems: {
        'arabic-digits': 'The number had Arabic digits: they became 0–9.',
        'not-digits-only': 'The number had characters other than digits: they were removed.',
        'leading-zero': 'The number started with a zero: it was removed.',
        'not-international':
          'We could not read the number with a country code: choose the country, or type the full number with its code.',
        'trunk-zero':
          'A zero after the country code, which the international form leaves out, was removed.',
      },
    },
    hreflang: {
      url: 'Version URL',
      code: 'Language and region code',
      add: 'Add a version',
      remove: 'Remove',
      xDefault: 'x-default URL (optional)',
      xDefaultHint:
        'The page for people whose language matches no version: usually the Arabic one, or a language picker.',
      submit: 'Make the tags',
      html: 'The tags, for every version',
      problem: (code, suggestion) =>
        suggestion === null
          ? `Google does not accept the code ${code}.`
          : `Google does not accept the code ${code}; the right one is ${suggestion}.`,
    },
    schema: {
      name: 'Product name',
      price: 'Price',
      currency: 'Currency',
      availability: 'Availability',
      availabilities: { InStock: 'In stock', OutOfStock: 'Out of stock', PreOrder: 'Pre-order' },
      url: 'Product page URL',
      image: 'Image URL',
      sku: 'Product code (SKU)',
      brand: 'Brand',
      description: 'Description',
      optional: 'optional',
      submit: 'Make the code',
      html: 'The code, for the product page',
      problems: {
        price:
          'Write the price as a number, with a full stop or an Arabic decimal mark, without a currency sign.',
        currency: 'Choose the currency from the list.',
        name: "Write the product's name.",
      },
    },
    robots: {
      file: 'The robots.txt file',
      url: 'The URL to test',
      crawler: 'Crawler',
      submit: 'Test',
      allowed: 'Allowed: the crawler may fetch this URL.',
      blocked: 'Blocked: the crawler may not fetch this URL.',
      rule: 'The rule that decided:',
      line: (line) => `on line ${String(line)}.`,
      noRule: 'No rule matches this URL, so it is allowed.',
      group: {
        specific: "The crawler's own group decided.",
        global: 'No group names the crawler, so the * group decided.',
        none: 'No group in the file applies to this crawler.',
      },
      badUrl: 'Write a full URL starting with https://',
    },
  },
}

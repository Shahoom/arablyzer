import type { Lang } from './copy'

/**
 * Fix steps for one platform, for the rules whose fix differs there: the report's `facts.platform`
 * names the platform, and a finding of the rule can show these beside the general fix ("on
 * Salla: …"). Only a few are written; a rule or platform without one has none, and the general
 * fix stands. Markdown, short. Steps for a hosted platform say where its settings are, never a
 * file to edit that its customers cannot reach.
 */
export const PLATFORM_FIXES: Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<Lang, string>>>>>
> = {
  'meta-description-missing': {
    wordpress: {
      en: [
        'Write it in an SEO plugin, not in the theme:',
        '',
        '1. Install and activate **Yoast SEO** or **Rank Math**, if neither is there.',
        '2. Edit the page or post, and find the plugin’s box under the editor (Yoast: _Meta description_).',
        '3. Write a description of 120 to 160 characters, and update the page.',
        '4. For the home page, and for every page at once, set a template in the plugin’s settings (Yoast: _Settings → Content types_).',
      ].join('\n'),
      ar: [
        'اكتبه في إضافة SEO لا في القالب:',
        '',
        '1. ثبّت وفعّل **Yoast SEO** أو **Rank Math** إن لم تكن إحداهما موجودة.',
        '2. حرّر الصفحة أو المقال، وابحث عن صندوق الإضافة تحت المحرّر (في Yoast: _Meta description_).',
        '3. اكتب وصفاً من 120 إلى 160 حرفاً، ثم حدّث الصفحة.',
        '4. للصفحة الرئيسية، ولكل الصفحات دفعة واحدة، اضبط قالباً في إعدادات الإضافة (في Yoast: _Settings → Content types_).',
      ].join('\n'),
    },
    salla: {
      en: [
        'There is no file to edit in a Salla store: its SEO fields are in the dashboard.',
        '',
        '1. For a product, open it from _Products_, and fill its SEO title and description fields.',
        '2. For the store’s home page, use the store’s SEO settings in the dashboard.',
        '3. Save, then scan the page again: Salla’s own theme writes the tag from these fields.',
      ].join('\n'),
      ar: [
        'لا ملف تحرّره في متجر سلة: حقول SEO في لوحة التحكم.',
        '',
        '1. للمنتج، افتحه من _المنتجات_، واملأ حقلي عنوان SEO ووصفه.',
        '2. للصفحة الرئيسية للمتجر، استعمل إعدادات SEO للمتجر في لوحة التحكم.',
        '3. احفظ ثم افحص الصفحة مرة أخرى: قالب سلة نفسه يكتب الوسم من هذه الحقول.',
      ].join('\n'),
    },
  },
  'url-slug-invalid': {
    salla: {
      en: [
        'The address of a product is a field of the product, in the dashboard:',
        '',
        '1. Open the product from _Products_, and in its data page find the SEO section.',
        '2. Write the custom address (the slug) in the words of the product, with hyphens between them: the slug generator on Arablyzer writes one.',
        '3. Save the product data. If the product was already ranking, keep the old address redirecting to the new one.',
      ].join('\n'),
      ar: [
        'عنوان المنتج حقل فيه، في لوحة التحكم:',
        '',
        '1. افتح المنتج من _المنتجات_، وفي صفحة بياناته ابحث عن قسم SEO.',
        '2. اكتب العنوان المخصص (الجزء الأخير) بكلمات المنتج وبينها شرطات: يكتبه لك مولّد الأجزاء في Arablyzer.',
        '3. احفظ بيانات المنتج. وإن كان المنتج يُرتَّب في البحث فأبقِ العنوان القديم يحوّل إلى الجديد.',
      ].join('\n'),
    },
    zid: {
      en: [
        'The address of a product or page is set in its own SEO fields in the Zid dashboard: open the product or page, write the address in the words of the product with hyphens between them (the slug generator on Arablyzer writes one), and save.',
        'Keep the old address redirecting to the new one if the page was already ranking.',
      ].join('\n'),
      ar: [
        'يُضبط عنوان المنتج أو الصفحة في حقول SEO الخاصة به في لوحة زد: افتح المنتج أو الصفحة، واكتب العنوان بكلمات المنتج وبينها شرطات (يكتبه لك مولّد الأجزاء في Arablyzer)، ثم احفظ.',
        'وأبقِ العنوان القديم يحوّل إلى الجديد إن كانت الصفحة تُرتَّب في البحث.',
      ].join('\n'),
    },
    shopify: {
      en: [
        'The address of a product is its URL handle:',
        '',
        '1. Open the product, and under _Search engine listing_ choose _Edit_.',
        '2. Write the _URL handle_ in the words of the product with hyphens between them.',
        '3. Keep _Create a URL redirect_ ticked when Shopify offers it, so the old address redirects to the new one.',
      ].join('\n'),
      ar: [
        'عنوان المنتج هو الـ URL handle فيه:',
        '',
        '1. افتح المنتج، وتحت _Search engine listing_ اختر _Edit_.',
        '2. اكتب _URL handle_ بكلمات المنتج وبينها شرطات.',
        '3. أبقِ _Create a URL redirect_ مفعّلاً حين تعرضه Shopify ليحوّل العنوان القديم إلى الجديد.',
      ].join('\n'),
    },
  },
  'zid-default-seo': {
    zid: {
      en: [
        'There is no file to edit in a Zid store: its SEO fields are in the dashboard.',
        '',
        '1. For the home page, open the store’s SEO settings in the Zid dashboard and write a title and a description.',
        '2. For a product or a category, open it and fill its SEO fields.',
        '3. Save, then scan the page again: the theme writes the tags from these fields.',
      ].join('\n'),
      ar: [
        'لا ملف تحرّره في متجر زد: حقول SEO في لوحة التحكم.',
        '',
        '1. للصفحة الرئيسية، افتح إعدادات SEO للمتجر في لوحة زد واكتب عنواناً ووصفاً.',
        '2. للمنتج أو التصنيف، افتحه واملأ حقول SEO فيه.',
        '3. احفظ ثم افحص الصفحة من جديد: القالب يكتب الوسوم من هذه الحقول.',
      ].join('\n'),
    },
  },
  'shopify-locale-mismatch': {
    shopify: {
      en: [
        'Arabic needs a right-to-left theme and translated content:',
        '',
        '1. Use a theme that supports right-to-left text: the Theme Store can be filtered by this feature.',
        '2. Translate the store’s content in _Translate & Adapt_ (products, collections, pages, menus, theme text).',
        '3. If the theme writes `lang="en"` in its layout, ask its developer to set `lang` and `dir` from the page’s language.',
      ].join('\n'),
      ar: [
        'العربية تحتاج قالباً من اليمين إلى اليسار ومحتوى مترجماً:',
        '',
        '1. استعمل قالباً يدعم النص من اليمين إلى اليسار: يمكن تصفية متجر القوالب بهذه الميزة.',
        '2. ترجم محتوى المتجر في _Translate & Adapt_ (المنتجات والمجموعات والصفحات والقوائم ونصوص القالب).',
        '3. وإن كتب القالب `lang="en"` في ملف التخطيط فاطلب من مطوّره أن يضبط `lang` و`dir` من لغة الصفحة.',
      ].join('\n'),
    },
  },
}

/** The steps for a rule on a platform, in a language; null when none are written. */
export function platformFix(ruleId: string, platformId: string, lang: Lang): string | null {
  return PLATFORM_FIXES[ruleId]?.[platformId]?.[lang] ?? null
}

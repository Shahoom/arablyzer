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
}

/** The steps for a rule on a platform, in a language; null when none are written. */
export function platformFix(ruleId: string, platformId: string, lang: Lang): string | null {
  return PLATFORM_FIXES[ruleId]?.[platformId]?.[lang] ?? null
}

import type { Copy } from './copy'
import { arabicCount, englishForm } from './plural'

/**
 * A tool page's tool (M2.2): its form, and its result under it. The page's island loads these
 * alone, not the directory's and the categories' words (TOOLS_UI), which the page's HTML has.
 */
export interface ToolAppStrings {
  readonly form: {
    readonly urlLabel: string
    readonly submit: string
    readonly submitting: string
    /** Under the form: free, and what the tool reads: the page, robots.txt, or the page drawn. */
    readonly note: Readonly<Record<'html' | 'robots' | 'render', string>>
  }
  readonly result: {
    readonly running: string
    readonly problems: (count: number) => string
    readonly passed: string
    readonly notApplicable: string
    readonly review: string
    /** The scan did not finish (partial or failed), or a rule could not run. */
    readonly incomplete: string
    /** Over the list of the tool's rules, each with what became of it. */
    readonly checked: string
    /** A rule's status, next to its title in that list. */
    readonly status: Readonly<
      Record<'pass' | 'fail' | 'needs-review' | 'not-applicable' | 'error', string>
    >
    /** Before the ids of the rules the tool ran. */
    readonly rules: (count: number) => string
    readonly share: string
    readonly howToFix: string
    readonly blocked: string
    /** The site's robots.txt asks ArablyzerBot not to check the page (M2.4 plan §2). */
    readonly optedOut: string
    readonly failed: string
    readonly offline: string
  }
}

export const TOOL_APP: Copy<ToolAppStrings> = {
  reviewed: false,
  ar: {
    form: {
      urlLabel: 'رابط الصفحة',
      submit: 'افحص الصفحة',
      submitting: 'نفحص…',
      note: {
        html: 'مجاني وبلا تسجيل. نقرأ الصفحة كما يرسلها الخادم.',
        robots: 'مجاني وبلا تسجيل. نقرأ ملف robots.txt كما يرسله الخادم.',
        render: 'مجاني وبلا تسجيل. نعرض الصفحة في المتصفحات كما يعرضها زائرك.',
      },
    },
    result: {
      running: 'نفحص الصفحة…',
      problems: (count) =>
        arabicCount(count, {
          one: 'مشكلة واحدة تحتاج إصلاحاً',
          two: 'مشكلتان تحتاجان إصلاحاً',
          few: '{n} مشكلات تحتاج إصلاحاً',
          many: '{n} مشكلة تحتاج إصلاحاً',
        }),
      passed: 'الصفحة تجتاز هذا الفحص',
      notApplicable: 'لا ينطبق هذا الفحص على الصفحة',
      review: 'فيها ما يحتاج أن تراجعه بنفسك',
      incomplete: 'لم يكتمل الفحص',
      checked: 'ما فحصناه',
      status: {
        pass: 'نجحت',
        fail: 'فشلت',
        'needs-review': 'تحتاج مراجعة',
        'not-applicable': 'لا تنطبق',
        error: 'تعذّر تشغيلها',
      },
      rules: (count) =>
        arabicCount(count, {
          one: 'القاعدة:',
          two: 'القاعدتان:',
          few: 'القواعد:',
          many: 'القواعد:',
        }),
      share: 'رابط هذه النتيجة',
      howToFix: 'كيف تُصلح',
      blocked: 'لم نتمكن من فحص الصفحة: ردّ الخادم بخطأ أو منع الفحص.',
      optedOut: 'طلب الموقع ألّا يفحص ArablyzerBot هذه الصفحة.',
      failed: 'تعذّر إكمال الفحص. جرّب بعد قليل.',
      offline: 'تعذّر الوصول إلى خدمة الفحص. تواصل الصفحة المحاولة.',
    },
  },
  en: {
    form: {
      urlLabel: 'Page URL',
      submit: 'Check the page',
      submitting: 'Checking…',
      note: {
        html: 'Free, no sign-up. We read the page as the server sends it.',
        robots: 'Free, no sign-up. We read robots.txt as the server sends it.',
        render: 'Free, no sign-up. We render the page in browsers, as your visitor sees it.',
      },
    },
    result: {
      running: 'Checking the page…',
      problems: (count) => (count === 1 ? '1 problem to fix' : `${String(count)} problems to fix`),
      passed: 'The page passes this check',
      notApplicable: 'This check does not apply to the page',
      review: 'Something here needs your own review',
      incomplete: 'The check did not finish',
      checked: 'What we checked',
      status: {
        pass: 'Passed',
        fail: 'Failed',
        'needs-review': 'Needs review',
        'not-applicable': 'Does not apply',
        error: 'Could not run',
      },
      rules: (count) => englishForm(count, 'Rule:', 'Rules:'),
      share: 'Link to this result',
      howToFix: 'How to fix',
      blocked:
        'We could not check the page: the server answered with an error, or refused the check.',
      optedOut: 'The site asked ArablyzerBot not to check this page.',
      failed: 'The check could not finish. Try again shortly.',
      offline: 'We cannot reach the checking service. The page keeps trying.',
    },
  },
}

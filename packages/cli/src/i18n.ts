import type { RuleStatus, ScanStatus, Severity } from '@arablyzer/report-schema'

export type Lang = 'ar' | 'en'

export interface Strings {
  readonly severity: Readonly<Record<Severity, string>>
  readonly status: Readonly<Record<RuleStatus, string>>
  readonly scan: Readonly<Record<ScanStatus, string>>
  readonly line: string
  readonly notices: string
  readonly ruleErrors: string
  readonly noProblems: string
  readonly usageHint: string
  readonly help: string
}

const HELP_EN = `Usage: arablyzer <url> [options]

Scans one web page and reports problems for Arabic and Gulf websites.

Options:
  --json                 Print the report as JSON on stdout (logs go to stderr)
  --lang ar|en           Language of the text output (default: from LANG)
  --rules id,id,...      Run only these rules
  --fail-on <severity>   Exit 1 when a rule fails at this severity or above:
                         critical, serious, moderate, minor or info
  --timeout <seconds>    Time limit for each request, 1 to 120 (default 30)
  --allow-private        Allow private and local addresses on any port, for local builds
                         (link-local and cloud metadata addresses stay blocked)
  -h, --help             Show this help
  -v, --version          Show the version

Exit codes: 0 scan complete; 1 failures at --fail-on or above; 2 scan not complete
(address blocked or unreachable, time limit, partial scan) or invalid options.
`

const HELP_AR = `الاستخدام: arablyzer <الرابط> [خيارات]

يفحص صفحة ويب واحدة ويبلّغ عن مشكلات المواقع العربية والخليجية.

الخيارات:
  --json                 اطبع التقرير بصيغة JSON على stdout (الرسائل الأخرى على stderr)
  --lang ar|en           لغة المخرجات النصية (الافتراضي: من LANG)
  --rules id,id,...      شغّل هذه القواعد فقط
  --fail-on <severity>   اخرج بالرمز 1 إذا فشلت قاعدة بهذه الخطورة أو أعلى:
                         critical أو serious أو moderate أو minor أو info
  --timeout <seconds>    مهلة كل طلب بالثواني، من 1 إلى 120 (الافتراضي 30)
  --allow-private        اسمح بالعناوين الخاصة والمحلية على أي منفذ، للبناءات المحلية
                         (عناوين link-local وmetadata تبقى محجوبة)
  -h, --help             اعرض هذه المساعدة
  -v, --version          اعرض رقم الإصدار

رموز الخروج: 0 اكتمل الفحص؛ 1 مخالفات عند --fail-on أو أعلى؛ 2 لم يكتمل الفحص
(رابط محجوب أو غير قابل للوصول، انتهاء المهلة، فحص جزئي) أو خيارات غير صالحة.
`

export const STRINGS: Readonly<Record<Lang, Strings>> = {
  en: {
    severity: {
      critical: 'critical',
      serious: 'serious',
      moderate: 'moderate',
      minor: 'minor',
      info: 'info',
    },
    status: {
      pass: 'passed',
      fail: 'failed',
      'needs-review': 'need review',
      'not-applicable': 'not applicable',
      error: 'could not run',
    },
    scan: { complete: 'complete', partial: 'partial', failed: 'failed' },
    line: 'line',
    notices: 'Notices',
    ruleErrors: 'Rules that could not run',
    noProblems: 'The selected rules found no problems.',
    usageHint: 'Run arablyzer --help for usage.',
    help: HELP_EN,
  },
  ar: {
    severity: {
      critical: 'حرِج',
      serious: 'خطير',
      moderate: 'متوسط',
      minor: 'بسيط',
      info: 'معلومة',
    },
    status: {
      pass: 'نجحت',
      fail: 'فشلت',
      'needs-review': 'تحتاج مراجعة',
      'not-applicable': 'لا تنطبق',
      error: 'تعذّر تشغيلها',
    },
    scan: { complete: 'مكتمل', partial: 'جزئي', failed: 'فشل' },
    line: 'السطر',
    notices: 'تنبيهات',
    ruleErrors: 'قواعد تعذّر تشغيلها',
    noProblems: 'لم تجد القواعد المختارة أي مشكلة.',
    usageHint: 'شغّل arablyzer --help لعرض طريقة الاستخدام.',
    help: HELP_AR,
  },
}

/** LC_ALL, then LC_MESSAGES, then LANG, as POSIX orders them; Arabic locales give Arabic. */
export function langFromEnv(env: Readonly<Record<string, string | undefined>>): Lang {
  const locale = [env.LC_ALL, env.LC_MESSAGES, env.LANG].find(
    (value) => value !== undefined && value !== '',
  )
  return locale?.toLowerCase().startsWith('ar') === true ? 'ar' : 'en'
}

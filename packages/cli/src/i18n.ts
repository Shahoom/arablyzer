import type {
  Engine,
  LabFact,
  RenderRun,
  RuleStatus,
  ScanStatus,
  Severity,
} from '@arablyzer/report-schema'

type LabMetrics = NonNullable<LabFact['metrics']>

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
  readonly render: Readonly<Record<RenderRun['status'], string>>
  readonly requests: (total: number, refused: number) => string
  /**
   * The overall score, out of 100, over `ran` of the rule set's `total` rules; partial when some
   * rule could not run.
   */
  readonly score: (value: number, partial: boolean, ran: number, total: number) => string
  /** Lighthouse's lab metrics, as information. */
  readonly lab: (version: string, performance: number | null, metrics: LabMetrics) => string
  /** When an engine is not installed: the command that installs it. */
  readonly installBrowsers: (engines: readonly Engine[], version: string) => string
  /** How to install what --lab needs: Lighthouse, puppeteer-core, and Playwright's Chromium. */
  readonly installLab: (lighthouse: string, puppeteer: string, playwright: string) => string
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
  --render               Also render the page in a browser (Chromium), behind the same
                         address rules, for the checks that need it
  --engines <list>       Render in these engines: chromium, firefox, webkit, or all.
                         WebKit sends WebRTC around the proxy, so it runs only in a
                         container whose network is isolated (ARABLYZER_NETWORK_ISOLATED=1);
                         elsewhere, all means chromium and firefox
  --screenshots <dir>    Save a screenshot of the first screen per engine as <dir>/<engine>.png
  --lab                  Also measure the page with Lighthouse in Chromium, as information:
                         lab metrics vary from run to run and never enter the score
  -h, --help             Show this help
  -v, --version          Show the version

Real visitors' speed (Core Web Vitals) comes from Google's Chrome UX Report with an API key
in ARABLYZER_CRUX_API_KEY; the page's URL is sent to Google. Without it, those checks do not run.

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
  --render               اعرض الصفحة في متصفح أيضاً (Chromium)، بقواعد العناوين نفسها،
                         للفحوص التي تحتاج ذلك
  --engines <list>       اعرضها في هذه المحرّكات: chromium أو firefox أو webkit أو all.
                         WebKit يرسل WebRTC دون المرور بالبروكسي، فلا يعمل إلا داخل حاوية
                         شبكتها معزولة (ARABLYZER_NETWORK_ISOLATED=1)؛ وفي غيرها تعني all
                         المحرّكين chromium وfirefox
  --screenshots <dir>    احفظ لقطة للشاشة الأولى في كل محرّك باسم <dir>/<engine>.png
  --lab                  قِس الصفحة أيضاً بـ Lighthouse في Chromium، للمعلومة: قياسات المختبر
                         تتغير من تشغيل لآخر ولا تدخل الدرجة أبداً
  -h, --help             اعرض هذه المساعدة
  -v, --version          اعرض رقم الإصدار

سرعة الزوار الحقيقيين (Core Web Vitals) من تقرير Google (Chrome UX Report)، بمفتاح API في
ARABLYZER_CRUX_API_KEY، ويُرسَل رابط الصفحة إلى Google. دونه لا تعمل هذه الفحوص.

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
    render: {
      rendered: 'rendered',
      failed: 'could not render',
      timeout: 'out of time',
      unavailable: 'not installed',
      refused: 'needs an isolated network',
    },
    requests: (total, refused) => {
      const requests = `${total} ${total === 1 ? 'request' : 'requests'}`
      return refused === 0 ? requests : `${requests}, ${refused} refused`
    },
    score: (value, partial, ran, total) =>
      `Score ${value}/100${ran < total ? ` over ${ran} of ${total} rules` : ''}${partial ? ' (partial: some rules could not run)' : ''}`,
    lab: (version, performance, metrics) =>
      [
        `Lighthouse ${version} (lab, information only)`,
        ...(performance === null ? [] : [`performance ${performance}`]),
        ...labParts(metrics, 's', 'ms'),
      ].join(' · '),
    installBrowsers: (engines, version) =>
      `to render in ${engines.join(', ')}, install it with: npx playwright-core@${version} install ${engines.join(' ')}`,
    installLab: (lighthouse, puppeteer, playwright) =>
      `to measure with Lighthouse, install lighthouse@${lighthouse} and puppeteer-core@${puppeteer} next to Arablyzer, and Chromium with: npx playwright-core@${playwright} install chromium`,
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
    render: {
      rendered: 'عُرضت',
      failed: 'تعذّر العرض',
      timeout: 'انتهى الوقت',
      unavailable: 'غير مثبّت',
      refused: 'يحتاج شبكة معزولة',
    },
    requests: (total, refused) =>
      refused === 0 ? arabicRequests(total) : `${arabicRequests(total)}، رُفض منها ${refused}`,
    score: (value, partial, ran, total) =>
      `الدرجة ${value} من 100${ran < total ? `، محسوبة على ${arabicRules(ran)} من ${total}` : ''}${partial ? ' (جزئية: تعذّر تشغيل بعض القواعد)' : ''}`,
    lab: (version, performance, metrics) =>
      [
        `Lighthouse ${version} (مختبر، للمعلومة فقط)`,
        ...(performance === null ? [] : [`الأداء ${performance}`]),
        ...labParts(metrics, 'ث', 'م.ث'),
      ].join(' · '),
    installBrowsers: (engines, version) =>
      `لعرض الصفحة في ${engines.join('، ')} ثبّته بالأمر: npx playwright-core@${version} install ${engines.join(' ')}`,
    installLab: (lighthouse, puppeteer, playwright) =>
      `للقياس بـ Lighthouse ثبّت lighthouse@${lighthouse} وpuppeteer-core@${puppeteer} مع Arablyzer، ومتصفح Chromium بالأمر: npx playwright-core@${playwright} install chromium`,
  },
}

const ARABIC_PLURAL = new Intl.PluralRules('ar')

/** A count of rules in the form Arabic gives each number, after a preposition (1, 2, 3–10, 11–99…). */
function arabicRules(total: number): string {
  switch (ARABIC_PLURAL.select(total)) {
    case 'one':
      return 'قاعدة واحدة'
    case 'two':
      return 'قاعدتين'
    case 'few':
      return `${total} قواعد`
    default:
      return `${total} قاعدة`
  }
}

/** A count of requests with the noun in the form Arabic gives each number (1, 2, 3–10, 11–99…). */
function arabicRequests(total: number): string {
  switch (ARABIC_PLURAL.select(total)) {
    case 'zero':
      return 'لا طلبات'
    case 'one':
      return 'طلب واحد'
    case 'two':
      return 'طلبان'
    case 'few':
      return `${total} طلبات`
    case 'many':
      return `${total} طلباً`
    default:
      return `${total} طلب`
  }
}

/** LC_ALL, then LC_MESSAGES, then LANG, as POSIX orders them; Arabic locales give Arabic. */
export function langFromEnv(env: Readonly<Record<string, string | undefined>>): Lang {
  const locale = [env.LC_ALL, env.LC_MESSAGES, env.LANG].find(
    (value) => value !== undefined && value !== '',
  )
  return locale?.toLowerCase().startsWith('ar') === true ? 'ar' : 'en'
}

/** Each lab metric Lighthouse measured, in seconds or milliseconds as it reports them. */
function labParts(metrics: LabMetrics, seconds: string, milliseconds: string): string[] {
  const time = (value: number) => `${(value / 1000).toFixed(1)} ${seconds}`
  return [
    metrics.fcp === null ? null : `FCP ${time(metrics.fcp)}`,
    metrics.lcp === null ? null : `LCP ${time(metrics.lcp)}`,
    metrics.tbt === null ? null : `TBT ${metrics.tbt} ${milliseconds}`,
    metrics.cls === null ? null : `CLS ${metrics.cls}`,
    metrics.si === null ? null : `Speed Index ${time(metrics.si)}`,
  ].filter((part) => part !== null)
}

import type { Copy } from './copy'

/** Why a scan could not start or finish, as the two integrations tell the person. */
export type StartProblem =
  | 'unauthorized'
  | 'plan_limit'
  | 'rate_limited'
  | 'blocked_target'
  | 'invalid_url'
  | 'invalid_request'
  | 'accounts_off'
  | 'network'
  | 'unavailable'
  | 'timeout'
  | 'scan_failed'
  | 'bad_response'

type Severities = Readonly<Record<'critical' | 'serious' | 'moderate' | 'minor' | 'info', string>>

/** The GitHub Action's job summary (markdown) and SARIF text, in the language the workflow asks for. */
export interface ActionStrings {
  readonly heading: string
  readonly score: (score: number) => string
  readonly noScore: string
  readonly partial: string
  readonly severity: Severities
  readonly counts: string
  readonly topIssues: string
  readonly columns: readonly [rule: string, severity: string, count: string, example: string]
  readonly moreIssues: (more: number) => string
  readonly noIssues: string
  readonly fullReport: string
  readonly started: string
  readonly gate: {
    readonly passed: (failOn: string) => string
    readonly failed: (count: number, failOn: string) => string
  }
  readonly errorHeading: string
  readonly problems: Readonly<Record<StartProblem, string>>
  readonly retryAfter: (seconds: number) => string
  readonly footer: string
}

/** The Chrome extension's popup and options page. */
export interface ExtensionStrings {
  readonly name: string
  readonly description: string
  readonly popup: {
    readonly page: string
    readonly scan: string
    readonly scanAgain: string
    readonly scanning: string
    readonly states: Readonly<Record<'queued' | 'running', string>>
    readonly score: string
    readonly scoreOf: (score: number) => string
    readonly bands: Readonly<Record<'good' | 'mid' | 'low', string>>
    readonly noScore: string
    readonly partial: string
    readonly severity: Severities
    readonly topIssues: string
    readonly noIssues: string
    readonly occurrences: (count: number) => string
    readonly moreIssues: (more: number) => string
    readonly openReport: string
    readonly ruleLink: (title: string) => string
    readonly noKeyTitle: string
    readonly noKeyLead: string
    readonly openSite: string
    readonly addKey: string
    readonly settings: string
    readonly unsupported: string
    readonly retryAfter: (seconds: number) => string
    readonly noPermission: string
    readonly problems: Readonly<Record<StartProblem, string>>
  }
  readonly options: {
    readonly title: string
    readonly lead: string
    readonly keyLabel: string
    readonly keyHelp: string
    readonly hostLabel: string
    readonly hostHelp: string
    readonly langLabel: string
    readonly langAuto: string
    readonly save: string
    readonly saved: string
    readonly test: string
    readonly testing: string
    readonly testOk: string
    readonly remove: string
    readonly removed: string
    readonly privacy: string
    readonly problems: Readonly<
      Record<'badKey' | 'badHost' | 'permission' | 'noKey', string> & Record<StartProblem, string>
    >
  }
}

export interface IntegrationsStrings {
  readonly action: ActionStrings
  readonly extension: ExtensionStrings
}

/** The GitHub Action (M5.2) and the Chrome extension (M5.2): one file, since both speak for the same API. */
export const INTEGRATIONS_UI: Copy<IntegrationsStrings> = {
  reviewed: false,
  ar: {
    action: {
      heading: 'تقرير Arablyzer',
      score: (score) => `الدرجة: **${String(score)} من 100**`,
      noScore: 'لا درجة لهذا الفحص: لم تُبلَغ الصفحة أو لم تنطبق عليها قاعدة.',
      partial: 'تعذّر تشغيل بعض القواعد، فالدرجة تحسب ما عمل منها فقط.',
      severity: {
        critical: 'حرجة',
        serious: 'خطيرة',
        moderate: 'متوسطة',
        minor: 'طفيفة',
        info: 'معلومة',
      },
      counts: 'المشكلات حسب الخطورة',
      topIssues: 'أهم المشكلات',
      columns: ['القاعدة', 'الخطورة', 'العدد', 'مثال'],
      moreIssues: (more) => `وفي التقرير الكامل ${String(more)} قواعد أخرى.`,
      noIssues: 'لا مشكلات. أحسنت.',
      fullReport: 'افتح التقرير الكامل',
      started: 'بدأ الفحص ولم ننتظره (`wait: false`). افتح التقرير عند انتهائه من الرابط أدناه.',
      gate: {
        passed: (failOn) => `اجتاز الفحص شرط الفشل: لا مشكلات ${failOn} أو أشد.`,
        failed: (count, failOn) => `فشل الفحص: ${String(count)} من المشكلات ${failOn} أو أشد.`,
      },
      errorHeading: 'تعذّر الفحص',
      problems: {
        unauthorized: 'مفتاح الـ API غير صالح أو أُلغي. أنشئ مفتاحاً من صفحة حسابك.',
        plan_limit: 'بلغت حدّ خطة حسابك، أو أنها لا تشمل الـ API.',
        rate_limited: 'بلغت حداً مؤقتاً للطلبات أو للفحوص.',
        blocked_target: 'هذا العنوان لا يُفحص: عنوان داخلي أو خاص.',
        invalid_url: 'هذا العنوان ليس صفحة يمكن فحصها (http أو https).',
        invalid_request: 'رفضت الخدمة الطلب.',
        accounts_off: 'الحسابات مطفأة في هذه الخدمة، فلا API.',
        network: 'تعذّر الاتصال بـ Arablyzer.',
        unavailable: 'الخدمة غير متاحة الآن.',
        timeout: 'استغرق الفحص أطول من `timeout_seconds`.',
        scan_failed: 'انتهى الفحص بالفشل: لم تُبلَغ الصفحة.',
        bad_response: 'ردّت الخدمة بما لا نعرفه. تأكد من `api_url`.',
      },
      retryAfter: (seconds) => `حاول بعد ${String(seconds)} ثانية.`,
      footer: 'فُحصت بـ Arablyzer',
    },
    extension: {
      name: 'Arablyzer: فاحص المواقع العربية',
      description:
        'افحص الصفحة المفتوحة بقواعد Arablyzer، واعرف درجتها وأهم مشكلاتها دون مغادرة المتصفح.',
      popup: {
        page: 'الصفحة الحالية',
        scan: 'افحص هذه الصفحة',
        scanAgain: 'افحص من جديد',
        scanning: 'نفحص الصفحة…',
        states: { queued: 'الفحص في الطابور…', running: 'نفحص الصفحة…' },
        score: 'الدرجة',
        scoreOf: (score) => `${String(score)} من 100`,
        bands: { good: 'جيدة', mid: 'متوسطة', low: 'ضعيفة' },
        noScore: 'لا درجة لهذا الفحص',
        partial: 'تعذّر تشغيل بعض القواعد، فالدرجة تحسب ما عمل منها.',
        severity: {
          critical: 'حرجة',
          serious: 'خطيرة',
          moderate: 'متوسطة',
          minor: 'طفيفة',
          info: 'معلومة',
        },
        topIssues: 'أهم المشكلات',
        noIssues: 'لا مشكلات ظاهرة. أحسنت.',
        occurrences: (count) => (count === 1 ? 'موضع واحد' : `${String(count)} مواضع`),
        moreIssues: (more) => `و${String(more)} قواعد أخرى في التقرير الكامل`,
        openReport: 'افتح التقرير الكامل',
        ruleLink: (title) => `اقرأ عن القاعدة: ${title}`,
        noKeyTitle: 'لم تضف مفتاح API بعد',
        noKeyLead:
          'بمفتاح من حسابك تفحص الإضافة الصفحة هنا وتعرض النتيجة. وبدونه نفتح لك صفحة الفحص في الموقع.',
        openSite: 'افتح صفحة الفحص في الموقع',
        addKey: 'أضف مفتاحاً',
        settings: 'الإعدادات',
        unsupported: 'لا يمكن فحص هذه الصفحة. افتح صفحة موقع على http أو https.',
        retryAfter: (seconds) => `حاول بعد ${String(seconds)} ثانية.`,
        noPermission: 'لم تُمنح الإضافة إذن الاتصال بهذه الخدمة. افتح الإعدادات واحفظ من جديد.',
        problems: {
          unauthorized: 'المفتاح غير صالح أو أُلغي. أضف مفتاحاً جديداً من الإعدادات.',
          plan_limit: 'بلغت حدّ خطة حسابك.',
          rate_limited: 'بلغت حداً مؤقتاً. انتظر قليلاً.',
          blocked_target: 'لا يُفحص هذا العنوان: عنوان داخلي أو خاص.',
          invalid_url: 'هذا العنوان ليس صفحة يمكن فحصها.',
          invalid_request: 'رفضت الخدمة الطلب.',
          accounts_off: 'الحسابات مطفأة في هذه الخدمة.',
          network: 'تعذّر الاتصال بـ Arablyzer. تحقق من الشبكة.',
          unavailable: 'الخدمة غير متاحة الآن. حاول بعد قليل.',
          timeout: 'استغرق الفحص أطول من المتوقع. افتح التقرير لاحقاً.',
          scan_failed: 'انتهى الفحص بالفشل: لم تُبلَغ الصفحة.',
          bad_response: 'ردّت الخدمة بما لا نعرفه. تأكد من عنوان الخدمة في الإعدادات.',
        },
      },
      options: {
        title: 'إعدادات Arablyzer',
        lead: 'مفتاحك يبقى عندك: تتصل الإضافة بخدمة Arablyzer وحدها، ولا تجمع شيئاً ولا تتتبّعك.',
        keyLabel: 'مفتاح API',
        keyHelp:
          'من صفحة حسابك، قسم «مفاتيح API». يبدأ بـ arb_. يُحفظ في تخزين Chrome المتزامن، فيصل إلى متصفحاتك الأخرى المسجّلة بحسابك.',
        hostLabel: 'عنوان الخدمة',
        hostHelp:
          'اتركه كما هو إلا إن كنت تشغّل Arablyzer على خادمك. سيسألك Chrome الإذن بالاتصال بهذا العنوان وحده.',
        langLabel: 'لغة الإضافة',
        langAuto: 'حسب المتصفح',
        save: 'حفظ',
        saved: 'حُفظت الإعدادات.',
        test: 'جرّب المفتاح',
        testing: 'نجرّب المفتاح…',
        testOk: 'المفتاح يعمل.',
        remove: 'احذف المفتاح',
        removed: 'حُذف المفتاح.',
        privacy:
          'لا تحليلات ولا شيفرة من الخارج. تُرسل الإضافة عنوان الصفحة التي تفحصها إلى الخدمة، لا غير.',
        problems: {
          badKey: 'المفتاح يبدأ بـ arb_ ويليه 43 حرفاً.',
          badHost: 'اكتب عنواناً يبدأ بـ https:// (أو http://localhost للتجربة).',
          permission: 'لم تمنح الإذن بالاتصال بهذا العنوان، فلم يُحفظ.',
          noKey: 'أضف مفتاحاً أولاً.',
          unauthorized: 'المفتاح غير صالح أو أُلغي.',
          plan_limit: 'خطة حسابك لا تشمل الـ API.',
          rate_limited: 'طلبات كثيرة. حاول بعد قليل.',
          blocked_target: 'رفضت الخدمة الطلب.',
          invalid_url: 'رفضت الخدمة الطلب.',
          invalid_request: 'رفضت الخدمة الطلب.',
          accounts_off: 'الحسابات مطفأة في هذه الخدمة.',
          network: 'تعذّر الاتصال. تحقق من العنوان والشبكة.',
          unavailable: 'الخدمة غير متاحة الآن.',
          timeout: 'استغرق الاتصال طويلاً.',
          scan_failed: 'رفضت الخدمة الطلب.',
          bad_response: 'ردّت الخدمة بما لا نعرفه. تأكد من العنوان.',
        },
      },
    },
  },
  en: {
    action: {
      heading: 'Arablyzer report',
      score: (score) => `Score: **${String(score)} of 100**`,
      noScore: 'No score for this scan: the page was not reached, or no rule applied.',
      partial: 'Some rules could not run, so the score counts only those that did.',
      severity: {
        critical: 'Critical',
        serious: 'Serious',
        moderate: 'Moderate',
        minor: 'Minor',
        info: 'Info',
      },
      counts: 'Findings by severity',
      topIssues: 'The worst problems',
      columns: ['Rule', 'Severity', 'Count', 'Example'],
      moreIssues: (more) => `${String(more)} more rules are in the full report.`,
      noIssues: 'No problems found. Well done.',
      fullReport: 'Open the full report',
      started:
        'The scan was started and not waited for (`wait: false`). Open the report when it finishes, from the link below.',
      gate: {
        passed: (failOn) => `The check passes: no ${failOn} findings or worse.`,
        failed: (count, failOn) => `The check fails: ${String(count)} ${failOn} findings or worse.`,
      },
      errorHeading: 'The scan did not run',
      problems: {
        unauthorized: 'The API key is not valid, or was revoked. Make a key on your account page.',
        plan_limit: 'The account has reached its plan’s limit, or its plan has no API.',
        rate_limited: 'A temporary request or scan limit was reached.',
        blocked_target: 'This address is never scanned: it is internal or private.',
        invalid_url: 'This address is not a page that can be scanned (http or https).',
        invalid_request: 'The service refused the request.',
        accounts_off: 'Accounts are off in this service, so there is no API.',
        network: 'Arablyzer could not be reached.',
        unavailable: 'The service is unavailable right now.',
        timeout: 'The scan took longer than `timeout_seconds`.',
        scan_failed: 'The scan ended in failure: the page was not reached.',
        bad_response: 'The service answered in a way this action does not know. Check `api_url`.',
      },
      retryAfter: (seconds) => `Try again in ${String(seconds)} seconds.`,
      footer: 'Checked with Arablyzer',
    },
    extension: {
      name: 'Arablyzer: Arabic website checker',
      description:
        'Check the open page with Arablyzer’s rules and see its score and its worst problems without leaving the browser.',
      popup: {
        page: 'Current page',
        scan: 'Check this page',
        scanAgain: 'Check again',
        scanning: 'Checking the page…',
        states: { queued: 'The scan is queued…', running: 'Checking the page…' },
        score: 'Score',
        scoreOf: (score) => `${String(score)} of 100`,
        bands: { good: 'Good', mid: 'Fair', low: 'Poor' },
        noScore: 'No score for this scan',
        partial: 'Some rules could not run, so the score counts only those that did.',
        severity: {
          critical: 'Critical',
          serious: 'Serious',
          moderate: 'Moderate',
          minor: 'Minor',
          info: 'Info',
        },
        topIssues: 'The worst problems',
        noIssues: 'No problems found. Well done.',
        occurrences: (count) => (count === 1 ? '1 place' : `${String(count)} places`),
        moreIssues: (more) => `and ${String(more)} more rules in the full report`,
        openReport: 'Open the full report',
        ruleLink: (title) => `Read about the rule: ${title}`,
        noKeyTitle: 'No API key yet',
        noKeyLead:
          'With a key from your account, the extension checks the page here and shows the result. Without one, we open the site’s scan page for you.',
        openSite: 'Open the scan page on the site',
        addKey: 'Add a key',
        settings: 'Settings',
        unsupported: 'This page cannot be checked. Open a website on http or https.',
        retryAfter: (seconds) => `Try again in ${String(seconds)} seconds.`,
        noPermission:
          'The extension has no permission to reach this service. Open the settings and save again.',
        problems: {
          unauthorized: 'The key is not valid, or was revoked. Add a new key in the settings.',
          plan_limit: 'The account has reached its plan’s limit.',
          rate_limited: 'A temporary limit was reached. Wait a little.',
          blocked_target: 'This address is never scanned: it is internal or private.',
          invalid_url: 'This address is not a page that can be scanned.',
          invalid_request: 'The service refused the request.',
          accounts_off: 'Accounts are off in this service.',
          network: 'Arablyzer could not be reached. Check the network.',
          unavailable: 'The service is unavailable right now. Try again in a moment.',
          timeout: 'The scan took longer than expected. Open the report later.',
          scan_failed: 'The scan ended in failure: the page was not reached.',
          bad_response:
            'The service answered in a way this extension does not know. Check the service address in the settings.',
        },
      },
      options: {
        title: 'Arablyzer settings',
        lead: 'Your key stays with you: the extension talks to the Arablyzer service alone, and collects nothing and tracks nothing.',
        keyLabel: 'API key',
        keyHelp:
          'From your account page, in “API keys”. It begins with arb_. It is kept in Chrome’s synced storage, so it reaches your other browsers signed in to your account.',
        hostLabel: 'Service address',
        hostHelp:
          'Leave it as it is unless you run Arablyzer on your own server. Chrome will ask your permission to reach that address alone.',
        langLabel: 'Extension language',
        langAuto: 'Follow the browser',
        save: 'Save',
        saved: 'Settings saved.',
        test: 'Test the key',
        testing: 'Testing the key…',
        testOk: 'The key works.',
        remove: 'Remove the key',
        removed: 'The key was removed.',
        privacy:
          'No analytics and no remote code. The extension sends the address of the page you check to the service, and nothing else.',
        problems: {
          badKey: 'A key begins with arb_ followed by 43 characters.',
          badHost: 'Write an address that begins with https:// (or http://localhost to try it).',
          permission: 'Permission to reach that address was not given, so it was not saved.',
          noKey: 'Add a key first.',
          unauthorized: 'The key is not valid, or was revoked.',
          plan_limit: 'The account’s plan has no API.',
          rate_limited: 'Too many requests. Try again in a moment.',
          blocked_target: 'The service refused the request.',
          invalid_url: 'The service refused the request.',
          invalid_request: 'The service refused the request.',
          accounts_off: 'Accounts are off in this service.',
          network: 'Could not connect. Check the address and the network.',
          unavailable: 'The service is unavailable right now.',
          timeout: 'The connection took too long.',
          scan_failed: 'The service refused the request.',
          bad_response:
            'The service answered in a way this extension does not know. Check the address.',
        },
      },
    },
  },
}

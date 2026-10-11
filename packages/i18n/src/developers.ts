import type { Copy } from './copy'

/** What can go wrong in the account page's API keys panel: the API's answers, and the page's own. */
export type KeysProblem =
  | 'limit'
  | 'closed'
  | 'unauthorized'
  | 'rate-limited'
  | 'bad-request'
  | 'not-found'
  | 'network'
  | 'unavailable'

/** A row of the endpoints table. */
export interface EndpointRow {
  readonly method: string
  readonly path: string
  readonly what: string
}

/** The developers' page (M5.1) and the API keys panel of the account page. `code` in backticks. */
export interface DevelopersStrings {
  readonly meta: { readonly title: string; readonly description: string }
  readonly breadcrumb: string
  readonly title: string
  readonly intro: string
  readonly contents: string
  readonly related: string
  readonly key: {
    readonly title: string
    readonly lead: string
    readonly steps: readonly string[]
    readonly open: string
  }
  readonly auth: {
    readonly title: string
    readonly lead: string
    readonly notes: readonly string[]
  }
  readonly quickstart: {
    readonly title: string
    readonly lead: string
    readonly curl: string
    readonly js: string
    readonly reads: string
  }
  readonly endpoints: {
    readonly title: string
    readonly lead: string
    readonly columns: readonly [string, string, string]
    readonly rows: readonly EndpointRow[]
  }
  readonly limits: { readonly title: string; readonly items: readonly string[] }
  readonly errors: {
    readonly title: string
    readonly lead: string
    readonly columns: readonly [string, string, string]
    readonly rows: readonly (readonly [string, string, string])[]
  }
  readonly spec: { readonly title: string; readonly lead: string; readonly link: string }
  readonly mcp: {
    readonly title: string
    readonly lead: string
    readonly tools: readonly (readonly [string, string])[]
    readonly resources: string
    readonly stdio: string
    readonly http: string
    readonly notes: readonly string[]
  }
  readonly action: {
    readonly title: string
    readonly lead: string
    readonly notes: readonly string[]
    readonly link: string
  }
  readonly extension: {
    readonly title: string
    readonly lead: string
    readonly steps: readonly string[]
    readonly notes: readonly string[]
    readonly link: string
  }
  readonly keys: {
    readonly title: string
    readonly lead: string
    readonly docs: string
    readonly count: (used: number, limit: number) => string
    readonly empty: string
    readonly closed: string
    readonly nameLabel: string
    readonly namePlaceholder: string
    readonly create: string
    readonly creating: string
    readonly createdTitle: string
    readonly createdLead: string
    readonly copy: string
    readonly copied: string
    readonly done: string
    readonly prefix: string
    readonly createdOn: string
    readonly lastUsed: string
    readonly neverUsed: string
    readonly revoke: string
    readonly revokeSure: string
    readonly revoking: string
    readonly cancel: string
    readonly revokeAria: (name: string) => string
    readonly loading: string
    readonly problems: Readonly<Record<KeysProblem, string>>
  }
}

const CODES = [
  'invalid_request',
  'invalid_url',
  'blocked_target',
  'unauthorized',
  'plan_limit',
  'not_found',
  'report_not_ready',
  'rate_limited',
  'accounts_off',
  'unavailable',
] as const

export const DEVELOPERS_UI: Copy<DevelopersStrings> = {
  reviewed: false,
  ar: {
    meta: {
      title: 'واجهة API والـ MCP للمطوّرين — Arablyzer',
      description:
        'افحص صفحة واقرأ تقريرها وشغّل أداة واحدة من كودك، بواجهة REST موثّقة بـ OpenAPI، أو من مساعد ذكي عبر خادم MCP. بمفتاح من حسابك وضمن حصة فحوصك.',
    },
    breadcrumb: 'للمطوّرين',
    title: 'واجهة API وخادم MCP',
    intro:
      'كل ما يفعله الموقع من فحص صفحة وقراءة تقريرها وتشغيل أداة واحدة وقراءة مكتبة القواعد متاح من كودك بواجهة REST بسيطة، وموثّق بمواصفة OpenAPI 3.1. وللمساعدات الذكية خادم MCP يفحص صفحة ويقرأ تقريرها من داخل المحادثة. تحتاج حساباً ومفتاحاً، وكل فحص يخصم من حصة حسابك نفسها: لا حصة ثانية للـ API.',
    contents: 'في هذه الصفحة',
    related: 'صفحات ذات صلة',
    key: {
      title: 'احصل على مفتاح',
      lead: 'المفاتيح من صفحة حسابك. لكل حساب مفتاحان على الأكثر، ويظهر سرّ كل مفتاح مرة واحدة عند إنشائه ولا نحتفظ إلا ببصمته، فإن ضاع أنشئ غيره.',
      steps: [
        'سجّل الدخول بحساب Google وافتح صفحة الحساب.',
        'في قسم «مفاتيح API» اكتب اسماً يذكّرك بالاستخدام (مثل «CI») واضغط «إنشاء مفتاح».',
        'انسخ السرّ الذي يبدأ بـ `arb_` واحفظه في مكان سرّي، كمتغير بيئة لا في الكود. يمكنك إلغاء المفتاح في أي وقت.',
      ],
      open: 'افتح صفحة الحساب',
    },
    auth: {
      title: 'المصادقة',
      lead: 'أرسل المفتاح في ترويسة `Authorization` من كل طلب:',
      notes: [
        'المفتاح وحده يفتح الـ API. كوكي تسجيل الدخول لا يفتحه.',
        'مفتاح غير صالح أو ملغى أو ناقص يأخذ الجواب نفسه: `401` وترويسة `WWW-Authenticate: Bearer`.',
        'لا تضع المفتاح في كود يعمل في المتصفح. الـ API للخوادم ولأدوات سطر الأوامر.',
      ],
    },
    quickstart: {
      title: 'ابدأ بفحص',
      lead: 'ابدأ فحصاً ثم اسأل عن حالته إلى أن ينتهي ثم اقرأ تقريره. الفحص يستغرق نحو نصف دقيقة.',
      curl: 'curl',
      js: 'JavaScript',
      reads:
        'الجواب دائماً `{ "data": … }`، والخطأ `{ "error": { "code", "message" } }`. التقرير هو التقرير نفسه الذي يعرضه الموقع ويطبعه سطر الأوامر، بمخطط JSON الموثّق في المواصفة.',
    },
    endpoints: {
      title: 'المسارات',
      lead: 'كلها تحت `/api/v1`. القوائم تقبل `limit` (حتى 100) و`cursor`، وتردّ `meta.nextCursor` حين يوجد المزيد.',
      columns: ['الطريقة', 'المسار', 'ما يفعله'],
      rows: [
        {
          method: 'POST',
          path: '/scans',
          what: 'يبدأ فحصاً لصفحة (`url`، و`engines` اختيارياً). إن فحص حسابك الصفحة نفسها قبل أقل من عشر دقائق عاد ذلك الفحص بـ `reused: true` ودون خصم من الحصة.',
        },
        { method: 'GET', path: '/scans', what: 'فحوص حسابك، الأحدث أولاً.' },
        {
          method: 'GET',
          path: '/scans/{id}',
          what: 'حالة فحص: `queued` أو `running` أو `complete` أو `partial` أو `failed`.',
        },
        {
          method: 'GET',
          path: '/scans/{id}/report',
          what: 'تقرير الفحص. يردّ `409` ما دام لم ينتهِ.',
        },
        {
          method: 'GET',
          path: '/tools',
          what: 'الأدوات: ما يشغَّل منها على صفحة وما يعمل في المتصفح.',
        },
        {
          method: 'POST',
          path: '/tools/{slug}/runs',
          what: 'يشغّل أداة واحدة على صفحة، بقواعدها وحدها. اقرأ نتيجته كأي فحص.',
        },
        { method: 'GET', path: '/rules', what: 'مكتبة القواعد.' },
        {
          method: 'GET',
          path: '/rules/{ruleId}',
          what: 'قاعدة بشرحها بالعربية والإنجليزية: لماذا تهم وكيف تُصلح وكيف نكشفها.',
        },
        { method: 'GET', path: '/openapi.json', what: 'مواصفة OpenAPI 3.1. لا تحتاج مفتاحاً.' },
      ],
    },
    limits: {
      title: 'الحدود والتكرار',
      items: [
        'الفحص يخصم من حصة فحوص حسابك نفسها (الدلو الذي يخصم منه الموقع)، ولا حصة ثانية. قد يحدّد صاحب الخدمة للـ API نصيباً أصغر منها. في جواب كل فحص: `X-Scans-Limit` و`X-Scans-Remaining`.',
        'لكل مفتاح ميزانية طلبات في الدقيقة تشمل القراءة. في كل جواب: `RateLimit-Limit` و`RateLimit-Remaining` و`RateLimit-Reset`. عند بلوغ حد يأتي `429` و`Retry-After` بالثواني.',
        'القراءة (حالة الفحص، التقرير، الأدوات، القواعد) لا تخصم من حصة الفحوص.',
        'جواب إنشاء الفحص يحمل `deleteToken` مرة واحدة: بإرساله في `DELETE /api/reports/{id}` تُحذف الفحص وتقريره.',
        'حين تكون الحسابات مطفأة في الخدمة يردّ كل مسار `503` ورمز `accounts_off`.',
      ],
    },
    errors: {
      title: 'الأخطاء',
      lead: 'لكل خطأ رمز ثابت تبني عليه، ورسالة بالإنجليزية للقراءة. `details` يحمل ما يلزم، مثل سبب رفض العنوان.',
      columns: ['الرمز', 'الحالة', 'المعنى'],
      rows: [
        ['invalid_request', '400', 'الطلب ليس ما يقبله المسار: جسم ليس JSON، أو حقل ناقص أو زائد.'],
        [
          'invalid_url',
          '400',
          'العنوان لا يصلح لفحص: غير صالح أو مخطط غير http وhttps أو طويل جداً أو فيه بيانات دخول أو منفذ ممنوع.',
        ],
        ['blocked_target', '422', 'عنوان لا يصل إليه الفحص: خاص أو داخلي أو لا يُحَلّ اسمه.'],
        ['unauthorized', '401', 'مفتاح ناقص أو غير صالح أو ملغى.'],
        ['plan_limit', '403', 'خطة الحساب لا تسمح بالمزيد (`details.limit` يسمّي الحد).'],
        ['not_found', '404', 'لا فحص ولا أداة ولا قاعدة بهذا المعرّف.'],
        [
          'report_not_ready',
          '409',
          'لا تقرير لهذا الفحص بعد، أو لن يكون له لأنه فشل (`details.state`).',
        ],
        [
          'rate_limited',
          '429',
          'بلغت حداً: حصة الفحوص أو ميزانية الطلبات أو حد الموقع المفحوص. `Retry-After` يقول متى.',
        ],
        ['accounts_off', '503', 'الحسابات مطفأة في هذه الخدمة فلا API.'],
        ['unavailable', '503', 'الخدمة غير متاحة الآن.'],
      ],
    },
    spec: {
      title: 'مواصفة OpenAPI',
      lead: 'المواصفة تُولَّد من تعريفات المسارات نفسها، وفيها مخطط التقرير كاملاً، فاستعملها لتوليد عميل بلغتك أو لاستيراد الـ API في أداتك.',
      link: 'openapi.json',
    },
    mcp: {
      title: 'خادم MCP للمساعدات الذكية',
      lead: 'بروتوكول سياق النموذج (MCP) يتيح لمساعد ذكي، مثل Claude، أن يفحص صفحة ويقرأ تقريرها ويشرح قاعدة. الخادم يستعمل الـ API نفسه بمفتاحك، فيسري عليه كل حد وكل قيد.',
      tools: [
        ['scan_page', 'يفحص صفحة وينتظر انتهاءها ويردّ بالدرجة وعدد المشكلات وأسوأها أولاً.'],
        ['get_report', 'ملخص فحص بدأ سابقاً.'],
        ['run_tool', 'يشغّل أداة واحدة على صفحة.'],
        ['list_tools', 'يعدّد الأدوات ويصفّيها بكلمة.'],
      ],
      resources:
        'ومكتبة القواعد موارد: `arablyzer://rules` فهرس، و`arablyzer://rules/ar/<id>` و`arablyzer://rules/en/<id>` شرح قاعدة بلغتها.',
      stdio: 'محلياً بـ stdio (يضاف إلى إعداد المساعد؛ المفتاح من البيئة):',
      http: 'عن بُعد على الموقع نفسه، بـ HTTP قابل للبث، والمفتاح في ترويسة `Authorization`:',
      notes: [
        'نقطة النهاية `/mcp` بلا جلسات: كل طلب مستقل، وتردّ بـ JSON.',
        'الشرح الكامل وإعدادات العملاء في `docs/mcp.md` بمستودع المشروع.',
      ],
    },
    action: {
      title: 'إجراء GitHub',
      lead: 'افحص صفحاتك من خط التكامل المستمر. يستعمل الإجراء الـ API نفسه بمفتاحك: ينتظر الفحص بأدب، ويكتب في ملخص المهمة الدرجة وأسوأ المشكلات، ويفشل الخطوة عند `fail_on`، ويكتب ملف SARIF لتظهر المشكلات في «Code scanning» على GitHub.',
      notes: [
        '`fail_on`: `critical` أو `serious` أو `none` (الافتراضي). و`lang`: لغة الملخص ورسائل SARIF، `ar` أو `en`.',
        'لعدة صفحات استعمل `urls` (حتى عشر). كل صفحة تخصم فحصاً واحداً من حصة حسابك، والصفحة نفسها خلال عشر دقائق لا تخصم شيئاً.',
        'يُكتب ملف SARIF لكل صفحة في المجلد `sarif_dir`، ويُرفع بـ `github/codeql-action/upload-sarif`. كل قاعدة فيه تشير إلى صفحتها في الموقع.',
        'مفتاحك سرٌّ من أسرار المستودع، والإجراء لا يطبعه في السجل.',
      ],
      link: 'الإجراء ودليله في المستودع',
    },
    extension: {
      title: 'إضافة Chrome',
      lead: 'افتح أي صفحة واضغط «افحص هذه الصفحة»: ترى درجتها وأسوأ مشكلاتها، وتظهر الدرجة على أيقونة الإضافة. تستعمل الإضافة الـ API بمفتاحك الذي تضعه في صفحة إعداداتها، وبدونه تفتح لك صفحة الفحص في الموقع.',
      steps: [
        'ابنِ الإضافة بالأمر `pnpm ext:build` من المستودع، فينتج المجلد `dist`.',
        'في `chrome://extensions` فعّل «وضع المطوّر»، واضغط «تحميل إضافة غير مضغوطة»، واختر المجلد `dist`.',
        'افتح إعدادات الإضافة، والصق مفتاح الـ API، واضغط «جرّب المفتاح».',
      ],
      notes: [
        'أذونات قليلة: `activeTab` و`storage`، وإذن الاتصال بخدمة Arablyzer وحدها. ولا خلفية تعمل ولا سكربت يُحقن في الصفحات.',
        'لا تحليلات ولا شيفرة من الخارج. المُرسَل إلى الخدمة عنوان الصفحة التي تفحصها، لا غير.',
      ],
      link: 'الإضافة ودليلها في المستودع',
    },
    keys: {
      title: 'مفاتيح API',
      lead: 'لاستعمال حسابك من كودك أو من مساعد ذكي. سرّ المفتاح يظهر مرة واحدة عند إنشائه.',
      docs: 'دليل المطوّرين',
      count: (used, limit) => `${String(used)} من ${String(limit)} مفاتيح`,
      empty: 'لا مفاتيح بعد.',
      closed: 'خطة حسابك لا تشمل الـ API.',
      nameLabel: 'اسم المفتاح',
      namePlaceholder: 'مثل: CI',
      create: 'إنشاء مفتاح',
      creating: 'ننشئ المفتاح…',
      createdTitle: 'مفتاحك الجديد',
      createdLead: 'انسخه الآن واحفظه في مكان سرّي. لن نعرضه مرة ثانية، ولا نحتفظ إلا ببصمته.',
      copy: 'نسخ',
      copied: 'نُسخ',
      done: 'حفظته، أغلق',
      prefix: 'البداية',
      createdOn: 'أُنشئ',
      lastUsed: 'آخر استعمال',
      neverUsed: 'لم يُستعمل بعد',
      revoke: 'إلغاء',
      revokeSure: 'ألغِ المفتاح',
      revoking: 'نلغيه…',
      cancel: 'تراجع',
      revokeAria: (name) => `إلغاء المفتاح ${name}`,
      loading: 'نقرأ المفاتيح…',
      problems: {
        limit: 'بلغت أقصى عدد من المفاتيح تسمح به خطتك. ألغِ مفتاحاً لتنشئ غيره.',
        closed: 'خطة حسابك لا تشمل الـ API.',
        unauthorized: 'انتهت جلستك. سجّل الدخول من جديد.',
        'rate-limited': 'طلبات كثيرة. حاول بعد قليل.',
        'bad-request': 'اكتب اسماً من حرف إلى أربعين حرفاً.',
        'not-found': 'لا يوجد هذا المفتاح. ربما أُلغي سابقاً.',
        network: 'تعذّر الاتصال. تحقق من الشبكة وحاول من جديد.',
        unavailable: 'الخدمة غير متاحة الآن. حاول بعد قليل.',
      },
    },
  },
  en: {
    meta: {
      title: 'API and MCP server for developers — Arablyzer',
      description:
        'Scan a page, read its report and run a single tool from your code over a REST API described by OpenAPI, or from an AI assistant through an MCP server. With a key from your account and inside your own scan quota.',
    },
    breadcrumb: 'For developers',
    title: 'The API and the MCP server',
    intro:
      'Everything the site does, scanning a page, reading its report, running a single tool and reading the rule library, is available from your code over a plain REST API described by OpenAPI 3.1. AI assistants get an MCP server that scans a page and reads its report from inside the conversation. You need an account and a key, and every scan comes out of your account’s own quota: the API has no second allowance.',
    contents: 'On this page',
    related: 'Related pages',
    key: {
      title: 'Get a key',
      lead: 'Keys are made on your account page. An account holds two at most. Each key’s secret is shown once, when it is made, and only its hash is kept, so if you lose it, make another.',
      steps: [
        'Sign in with Google and open the account page.',
        'In “API keys”, type a name that reminds you of its use (such as “CI”) and press “Create key”.',
        'Copy the secret, which begins `arb_`, and keep it somewhere private, as an environment variable and never in code. You can revoke the key at any time.',
      ],
      open: 'Open the account page',
    },
    auth: {
      title: 'Authentication',
      lead: 'Send the key in the `Authorization` header of every request:',
      notes: [
        'The key alone opens the API. The sign-in cookie does not.',
        'A key that is invalid, revoked or missing gets the same answer: `401` and `WWW-Authenticate: Bearer`.',
        'Never put the key in code that runs in a browser. The API is for servers and command-line tools.',
      ],
    },
    quickstart: {
      title: 'Start with a scan',
      lead: 'Start a scan, ask for its state until it ends, then read its report. A scan takes about half a minute.',
      curl: 'curl',
      js: 'JavaScript',
      reads:
        'An answer is always `{ "data": … }`, and an error `{ "error": { "code", "message" } }`. The report is the same report the site shows and the command line prints, in the JSON schema the specification documents.',
    },
    endpoints: {
      title: 'Endpoints',
      lead: 'All under `/api/v1`. Lists take `limit` (up to 100) and `cursor`, and answer `meta.nextCursor` when there is more.',
      columns: ['Method', 'Path', 'What it does'],
      rows: [
        {
          method: 'POST',
          path: '/scans',
          what: 'Starts a scan of a page (`url`, and optionally `engines`). If your account scanned the same page less than ten minutes ago, that scan is returned with `reused: true` and no quota is used.',
        },
        { method: 'GET', path: '/scans', what: 'Your account’s scans, newest first.' },
        {
          method: 'GET',
          path: '/scans/{id}',
          what: 'A scan’s state: `queued`, `running`, `complete`, `partial` or `failed`.',
        },
        {
          method: 'GET',
          path: '/scans/{id}/report',
          what: 'The scan’s report. Answers `409` until it has finished.',
        },
        {
          method: 'GET',
          path: '/tools',
          what: 'The tools: which run on a page and which run in the browser.',
        },
        {
          method: 'POST',
          path: '/tools/{slug}/runs',
          what: 'Runs one tool on a page, its rules alone. Read the result like any scan.',
        },
        { method: 'GET', path: '/rules', what: 'The rule library.' },
        {
          method: 'GET',
          path: '/rules/{ruleId}',
          what: 'A rule with its explanation in Arabic and English: why it matters, how to fix it, how it is detected.',
        },
        { method: 'GET', path: '/openapi.json', what: 'The OpenAPI 3.1 document. No key needed.' },
      ],
    },
    limits: {
      title: 'Limits and repeats',
      items: [
        'A scan comes out of your account’s own scan quota (the bucket the site draws on) and there is no second one. The operator may give the API a smaller share of it. Every scan answer carries `X-Scans-Limit` and `X-Scans-Remaining`.',
        'Each key has a budget of requests per minute, reads included. Every answer carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`. At a limit the answer is `429` with `Retry-After` in seconds.',
        'Reads (a scan’s state, a report, tools, rules) cost no scan from the quota.',
        'The answer that creates a scan carries a `deleteToken`, once: send it to `DELETE /api/reports/{id}` to delete the scan and its report.',
        'Where the service has accounts off, every route answers `503` with the code `accounts_off`.',
      ],
    },
    errors: {
      title: 'Errors',
      lead: 'Every error has a stable code to build on and a message in English to read. `details` carries what is needed, such as why an address was refused.',
      columns: ['Code', 'Status', 'Meaning'],
      rows: [
        [
          'invalid_request',
          '400',
          'The request is not what the route takes: a body that is not JSON, or a field missing or extra.',
        ],
        [
          'invalid_url',
          '400',
          'The address cannot be scanned: not a URL, a scheme other than http and https, too long, with credentials, or a port that is not allowed.',
        ],
        [
          'blocked_target',
          '422',
          'An address scans never reach: private, internal, or a name that does not resolve.',
        ],
        ['unauthorized', '401', 'A key that is missing, invalid or revoked.'],
        [
          'plan_limit',
          '403',
          'The account’s plan allows no more (`details.limit` names the limit).',
        ],
        ['not_found', '404', 'No scan, tool or rule has this id.'],
        [
          'report_not_ready',
          '409',
          'The scan has no report yet, or never will because it failed (`details.state`).',
        ],
        [
          'rate_limited',
          '429',
          'A limit was reached: the scan quota, the request budget, or the limit on the scanned site. `Retry-After` says when.',
        ],
        ['accounts_off', '503', 'Accounts are off in this service, so there is no API.'],
        ['unavailable', '503', 'The service is unavailable right now.'],
      ],
    },
    spec: {
      title: 'The OpenAPI document',
      lead: 'The document is built from the same definitions the routes check against, and carries the report’s whole schema. Use it to generate a client in your language or to import the API into your tool.',
      link: 'openapi.json',
    },
    mcp: {
      title: 'The MCP server for AI assistants',
      lead: 'The Model Context Protocol (MCP) lets an AI assistant such as Claude scan a page, read its report and explain a rule. The server uses this same API with your key, so every limit and every restriction applies to it.',
      tools: [
        [
          'scan_page',
          'Scans a page, waits for it, and answers with the score, the counts and the worst problems first.',
        ],
        ['get_report', 'The summary of a scan started earlier.'],
        ['run_tool', 'Runs one tool on a page.'],
        ['list_tools', 'Lists the tools, filtered by a word.'],
      ],
      resources:
        'The rule library is resources: `arablyzer://rules` is an index, and `arablyzer://rules/en/<id>` and `arablyzer://rules/ar/<id>` explain a rule in its language.',
      stdio:
        'Locally over stdio (added to the assistant’s configuration; the key comes from the environment):',
      http: 'Remotely on this site, over streamable HTTP, with the key in the `Authorization` header:',
      notes: [
        'The `/mcp` endpoint has no sessions: each request stands alone, and answers in JSON.',
        'The full guide and client configurations are in `docs/mcp.md` in the project’s repository.',
      ],
    },
    action: {
      title: 'The GitHub Action',
      lead: 'Scan your pages from your CI. The action uses this same API with your key: it waits for the scan politely, writes the score and the worst problems into the job summary, fails the step at `fail_on`, and writes a SARIF file so the findings appear in “Code scanning” on GitHub.',
      notes: [
        '`fail_on` is `critical`, `serious` or `none` (the default). `lang` is the language of the summary and of the SARIF messages, `ar` or `en`.',
        'Give `urls` for several pages (up to ten). Each page takes one scan from your account’s quota, and the same page within ten minutes takes none.',
        'A SARIF file per page is written to the folder `sarif_dir`, and uploaded with `github/codeql-action/upload-sarif`. Each rule in it points to its page on this site.',
        'Your key is a repository secret, and the action never prints it in the log.',
      ],
      link: 'The action and its guide in the repository',
    },
    extension: {
      title: 'The Chrome extension',
      lead: 'Open any page and press “Check this page”: you see its score and its worst problems, and the score shows on the extension’s icon. The extension uses the API with the key you put in its settings page; without one it opens the site’s scan page for you.',
      steps: [
        'Build the extension with `pnpm ext:build` in the repository, which makes the `dist` folder.',
        'In `chrome://extensions`, turn on “Developer mode”, press “Load unpacked”, and choose the `dist` folder.',
        'Open the extension’s settings, paste your API key, and press “Test the key”.',
      ],
      notes: [
        'Few permissions: `activeTab` and `storage`, and permission to reach the Arablyzer service alone. No background process runs, and no script is injected into pages.',
        'No analytics and no remote code. The service is sent the address of the page you check, and nothing else.',
      ],
      link: 'The extension and its guide in the repository',
    },
    keys: {
      title: 'API keys',
      lead: 'To use your account from your code or from an AI assistant. A key’s secret is shown once, when it is made.',
      docs: 'The developers’ guide',
      count: (used, limit) => `${String(used)} of ${String(limit)} keys`,
      empty: 'No keys yet.',
      closed: 'Your account’s plan has no API.',
      nameLabel: 'Key name',
      namePlaceholder: 'For example: CI',
      create: 'Create key',
      creating: 'Creating the key…',
      createdTitle: 'Your new key',
      createdLead:
        'Copy it now and keep it somewhere private. It is not shown again, and only its hash is kept.',
      copy: 'Copy',
      copied: 'Copied',
      done: 'I saved it, close',
      prefix: 'Starts with',
      createdOn: 'Made',
      lastUsed: 'Last used',
      neverUsed: 'Not used yet',
      revoke: 'Revoke',
      revokeSure: 'Revoke the key',
      revoking: 'Revoking…',
      cancel: 'Cancel',
      revokeAria: (name) => `Revoke the key ${name}`,
      loading: 'Reading the keys…',
      problems: {
        limit: 'You have as many keys as your plan allows. Revoke one to make another.',
        closed: 'Your account’s plan has no API.',
        unauthorized: 'Your session ended. Sign in again.',
        'rate-limited': 'Too many requests. Try again in a moment.',
        'bad-request': 'Write a name of one to forty characters.',
        'not-found': 'There is no such key. It may have been revoked already.',
        network: 'Could not connect. Check the network and try again.',
        unavailable: 'The service is unavailable right now. Try again in a moment.',
      },
    },
  },
}

/** The error codes the table documents, in its order (a test keeps it equal to the API's). */
export const DOCUMENTED_CODES: readonly string[] = CODES

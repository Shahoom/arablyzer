import type { AuthErrorCode, ScanState } from '@arablyzer/api-contract/codes'
import type { Copy } from './copy'
import { arabicCount, DAYS_DURATION, englishCount, type ArabicForms } from './plural'

/** What can go wrong in the sign-in and account pages: the API's codes, and the page's own. */
export type AccountProblem =
  | AuthErrorCode
  | 'network'
  /** Google did not vouch for the address (or gave none). */
  | 'unverified'
  /** The person closed Google's window or said no. */
  | 'cancelled'
  /** Anything else that ended a sign-in without an account. */
  | 'failed'

/** «every 3 days» in Arabic: after «كل» the day is singular for one, then as a count. */
const DAYS_EVERY: ArabicForms = { ...DAYS_DURATION, one: 'يوم', two: 'يومين' }
/** «1 site», «3 sites». */
const SITES_COUNT: ArabicForms = {
  one: 'موقعاً واحداً',
  two: 'موقعين',
  few: '{n} مواقع',
  many: '{n} موقعاً',
  other: '{n} موقع',
}

export interface AccountStrings {
  /** The header's link to the account page. */
  readonly link: string
  readonly login: {
    readonly title: string
    readonly lead: string
    /** The small print: what is kept, and what is not. */
    readonly keeps: string
    /** Under the Google button, while the page gets it ready. */
    readonly preparing: string
    /** Shown when Google's own button could not load, above ours. */
    readonly fallback: string
    /** Google's brand name for the button: "Sign in with Google", in its own words per language. */
    readonly google: string
    readonly working: string
    /** The page's title in the browser. */
    readonly pageTitle: string
    readonly pageDescription: string
  }
  readonly account: {
    readonly title: string
    readonly lead: string
    readonly email: string
    readonly name: string
    readonly language: string
    readonly languageHint: string
    readonly signOut: string
    readonly signOutEverywhere: string
    readonly signedOut: string
    readonly loading: string
    readonly pageTitle: string
    readonly pageDescription: string
    readonly unavailable: string
  }
  readonly delete: {
    readonly title: string
    readonly text: string
    readonly open: string
    readonly confirm: string
    readonly cancel: string
    readonly working: string
    /** The session is too old to erase an account: sign in again first. */
    readonly freshNeeded: string
    readonly signInAgain: string
    readonly done: string
    readonly doneDetail: string
  }
  /** Saved sites and the history (M4.2): numbers come from the API's answers, never from here. */
  readonly sites: {
    readonly title: string
    readonly lead: string
    /** «2 of 5»: the sites saved and the plan's limit. */
    readonly count: (used: number, limit: number) => string
    readonly addLabel: string
    readonly addPlaceholder: string
    readonly add: string
    readonly adding: string
    readonly empty: string
    readonly scanNow: string
    readonly scanning: string
    readonly removeLabel: (url: string) => string
    readonly remove: string
    readonly notScanned: string
    readonly lastScan: string
    readonly score: string
    readonly noScore: string
    readonly openReport: string
    readonly historyTitle: string
    /** «We keep your scans for 90 days, then delete them.» */
    readonly historyLead: (days: number) => string
    readonly historyEmpty: string
    readonly states: Readonly<Record<ScanState, string>>
    readonly loading: string
  }
  /** Monitoring a saved site (M4.3): numbers come from the API's answers. */
  readonly monitor: {
    readonly off: string
    readonly on: (everyDays: number) => string
    readonly nextRun: (date: string) => string
    readonly enable: string
    readonly enabling: string
    readonly disable: string
    readonly disabling: string
    readonly paused: string
    readonly failing: string
    readonly limitReached: (limit: number) => string
    readonly count: (used: number, limit: number) => string
    readonly trendTitle: string
    /** The alternative text of the little chart: the last scores, oldest first. */
    readonly trendLabel: (scores: string) => string
    readonly noScore: string
  }
  /** Where alerts go (M4.3). */
  readonly alerts: {
    readonly title: string
    readonly lead: string
    readonly webhookLabel: string
    readonly webhookPlaceholder: string
    readonly webhookHint: string
    readonly httpsOnly: string
    readonly save: string
    readonly saving: string
    readonly saved: string
    readonly sendingTo: (host: string, kind: string) => string
    readonly kinds: Readonly<Record<'slack' | 'discord' | 'generic', string>>
    readonly disabled: string
    readonly failures: (count: number) => string
    readonly remove: string
    readonly removing: string
    readonly test: string
    readonly testing: string
    readonly testOk: string
    readonly testFailed: (status: number | null) => string
    readonly rotate: string
    readonly secretTitle: string
    readonly secretLead: string
    readonly secretDone: string
    readonly thresholdBefore: string
    readonly thresholdAfter: string
    readonly onCritical: string
    readonly onDown: string
    readonly weeklySummary: string
    readonly email: string
    readonly loading: string
  }
  readonly problems: Readonly<Record<AccountProblem, string>>
}

export const ACCOUNT_UI: Copy<AccountStrings> = {
  reviewed: false,
  ar: {
    link: 'حسابي',
    login: {
      title: 'تسجيل الدخول',
      lead: 'الدخول اختياري. الفحص يبقى مجانياً وبلا حساب. ندخلك بحساب Google، فلا توجد كلمة مرور تُنشئها أو تنساها.',
      keeps:
        'نحفظ بريدك واسمك واللغة التي تختارها، والمواقع التي تحفظها، وفحوصك وأنت مسجّل الدخول مع تقاريرها، وكوكي واحداً يُبقيك مسجلاً للدخول. لا نحفظ كلمة مرور ولا صورة شخصية ولا أي شيء آخر من حساب Google. وتستطيع حذف حسابك في أي وقت.',
      preparing: 'نجهّز زر Google…',
      fallback: 'تعذّر تحميل زر Google هنا، فادخل من صفحة Google نفسها.',
      google: 'تسجيل الدخول باستخدام Google',
      working: 'ندخلك…',
      pageTitle: 'تسجيل الدخول — Arablyzer',
      pageDescription:
        'ادخل إلى حسابك في Arablyzer بحساب Google. الدخول اختياري، والفحص مجاني بلا حساب.',
    },
    account: {
      title: 'حسابك',
      lead: 'سجّلت الدخول بحساب Google.',
      email: 'البريد',
      name: 'الاسم',
      language: 'اللغة',
      languageHint: 'لغة حسابك.',
      signOut: 'تسجيل الخروج',
      signOutEverywhere: 'الخروج من كل الأجهزة',
      signedOut: 'سجّلت خروجك.',
      loading: 'نفتح حسابك…',
      pageTitle: 'حسابك — Arablyzer',
      pageDescription: 'حسابك في Arablyzer: مواقعك المحفوظة وفحوصك الأخيرة، والخروج وحذف الحساب.',
      unavailable: 'الحسابات غير مفعّلة في هذا الموقع. الفحص يعمل كالمعتاد بلا حساب.',
    },
    delete: {
      title: 'حذف الحساب',
      text: 'يمحو هذا حسابك وجلساتك والبريد والاسم اللذين حفظناهما، ومواقعك المحفوظة، وفحوصك التي أجريتها وأنت مسجّل الدخول مع تقاريرها. لا يمكن التراجع عن ذلك. أما فحوصك بلا تسجيل دخول فغير مرتبطة بحسابك وتبقى كما هي.',
      open: 'حذف الحساب…',
      confirm: 'احذف حسابي نهائياً',
      cancel: 'إلغاء',
      working: 'نحذف الحساب…',
      freshNeeded: 'لحمايتك، ادخل مرة أخرى قبل الحذف. لن يستغرق ذلك إلا لحظة.',
      signInAgain: 'الدخول من جديد',
      done: 'حُذف حسابك.',
      doneDetail: 'لم يبقَ عندنا شيء عنك.',
    },
    sites: {
      title: 'مواقعك',
      lead: 'احفظ مواقعك لتفحصها من هنا بضغطة واحدة، وتجد فحوصها الأخيرة ودرجاتها.',
      count: (used, limit) => `المحفوظ ${used} من أصل ${limit}`,
      addLabel: 'رابط الموقع',
      addPlaceholder: 'https://example.com',
      add: 'احفظ الموقع',
      adding: 'نحفظ الموقع…',
      empty: 'لم تحفظ موقعاً بعد.',
      scanNow: 'افحص الآن',
      scanning: 'نبدأ الفحص…',
      removeLabel: (url) => `احذف ${url} من مواقعك`,
      remove: 'احذف',
      notScanned: 'لم يُفحص بعد',
      lastScan: 'آخر فحص',
      score: 'الدرجة',
      noScore: 'بلا درجة',
      openReport: 'افتح التقرير',
      historyTitle: 'فحوصك الأخيرة',
      historyLead: (days) => `نحتفظ بفحوصك لمدة ${arabicCount(days, DAYS_DURATION)}، ثم نحذفها.`,
      historyEmpty: 'لم تفحص شيئاً وأنت مسجّل الدخول بعد.',
      states: {
        queued: 'في الانتظار',
        running: 'يعمل الآن',
        complete: 'اكتمل',
        partial: 'اكتمل جزئياً',
        failed: 'تعذّر',
      },
      loading: 'نفتح مواقعك…',
    },
    monitor: {
      off: 'غير مراقَب',
      on: (days) => `نفحصه تلقائياً كل ${arabicCount(days, DAYS_EVERY)}`,
      nextRun: (date) => `الفحص التالي: ${date}`,
      enable: 'راقب هذا الموقع',
      enabling: 'نفعّل المراقبة…',
      disable: 'أوقف المراقبة',
      disabling: 'نوقف المراقبة…',
      paused: 'المراقبة متوقفة. أوقفها ثم شغّلها من جديد لتستأنف.',
      failing: 'تعذّر الوصول إلى الموقع في آخر فحص.',
      limitReached: (limit) =>
        `خطتك تراقب ${arabicCount(limit, SITES_COUNT)}. أوقف مراقبة موقع آخر لتراقب هذا.`,
      count: (used, limit) => `المراقَب ${used} من أصل ${limit}`,
      trendTitle: 'آخر النتائج',
      trendLabel: (scores) => `آخر الدرجات، من الأقدم: ${scores}`,
      noScore: 'بلا درجة',
    },
    alerts: {
      title: 'التنبيهات',
      lead: 'نرسل رسالة إلى رابط webhook الذي تلصقه هنا عندما تنخفض درجة موقع تراقبه، أو تظهر مشكلة حرجة جديدة، أو يتعذّر فحصه. يعمل مع Slack وDiscord وأي خدمة تستقبل JSON.',
      webhookLabel: 'عنوان webhook',
      webhookPlaceholder: 'https://hooks.slack.com/services/…',
      webhookHint: 'الصق العنوان من Slack أو Discord أو من خدمتك. لا نعرضه بعد الحفظ.',
      httpsOnly: 'نقبل عناوين https وحدها.',
      save: 'احفظ التنبيهات',
      saving: 'نحفظ…',
      saved: 'حُفظت التنبيهات.',
      sendingTo: (host, kind) => `نرسل إلى ${host} (${kind})`,
      kinds: { slack: 'Slack', discord: 'Discord', generic: 'JSON عام' },
      disabled: 'أُوقف هذا العنوان بعد فشل متكرر. أرسل رسالة تجريبية لتعيده.',
      failures: (count) => `فشل ${count} من آخر الإرسالات.`,
      remove: 'احذف العنوان',
      removing: 'نحذف العنوان…',
      test: 'أرسل رسالة تجريبية',
      testing: 'نرسل…',
      testOk: 'أُرسلت الرسالة التجريبية. تفقّد قناتك.',
      testFailed: (status) =>
        status === null
          ? 'لم نصل إلى العنوان. تأكد منه وأعد المحاولة.'
          : `ردّ العنوان بالرمز ${status} ولم يقبل الرسالة.`,
      rotate: 'مفتاح توقيع جديد',
      secretTitle: 'مفتاح التوقيع',
      secretLead:
        'تحمل كل رسالة ترويسة X-Arablyzer-Signature موقّعة بهذا المفتاح كما في الصيغة أدناه، والوقت في ترويسة X-Arablyzer-Timestamp. انسخ المفتاح الآن، فلن نعرضه مرة أخرى.',
      secretDone: 'نسخته',
      thresholdBefore: 'نبّهني إذا انخفضت الدرجة',
      thresholdAfter: 'نقطة أو أكثر',
      onCritical: 'مشاكل حرجة جديدة',
      onDown: 'تعذّر فحص الموقع',
      weeklySummary: 'ملخص أسبوعي',
      email: 'البريد الإلكتروني',
      loading: 'نفتح التنبيهات…',
    },
    problems: {
      'bad-request': 'تعذّر قراءة الطلب. حدّث الصفحة وأعد المحاولة.',
      'rate-limited': 'محاولات كثيرة.',
      unauthorized: 'لم تسجّل الدخول.',
      'invalid-token': 'لم نقبل ردّ Google. أعد المحاولة.',
      'fresh-login-required': 'لحمايتك، ادخل مرة أخرى ثم أعد المحاولة.',
      'plan-limit': 'وصلت إلى الحد الذي تتيحه خطتك من المواقع المحفوظة. احذف موقعاً لتحفظ غيره.',
      'not-found': 'الحسابات غير مفعّلة في هذا الموقع.',
      conflict: 'عندك زحف عميق يعمل الآن. انتظر انتهاءه أو ألغِه ثم أعد المحاولة.',
      unavailable: 'خدمة الحسابات غير متاحة الآن. أعد المحاولة بعد قليل.',
      network: 'لم نصل إلى الخدمة. تأكد من اتصالك وأعد المحاولة.',
      unverified: 'لم تؤكد Google بريدك الإلكتروني، فلا نستطيع إدخالك به.',
      cancelled: 'أُلغي تسجيل الدخول.',
      failed: 'لم يكتمل تسجيل الدخول. أعد المحاولة.',
    },
  },
  en: {
    link: 'Account',
    login: {
      title: 'Sign in',
      lead: 'Signing in is optional. Scans stay free and need no account. You sign in with Google, so there is no password to make or lose.',
      keeps:
        'We keep your email address, your name, the language you choose, the sites you save, the scans you run while signed in with their reports, and one cookie that keeps you signed in. We keep no password, no profile picture and nothing else from your Google account. You can delete your account at any time.',
      preparing: 'Getting the Google button ready…',
      fallback: 'Google’s button could not load here, so sign in on Google’s own page.',
      google: 'Sign in with Google',
      working: 'Signing you in…',
      pageTitle: 'Sign in — Arablyzer',
      pageDescription:
        'Sign in to your Arablyzer account with Google. Signing in is optional; scanning is free without one.',
    },
    account: {
      title: 'Your account',
      lead: 'You are signed in with Google.',
      email: 'Email',
      name: 'Name',
      language: 'Language',
      languageHint: 'The language of your account.',
      signOut: 'Sign out',
      signOutEverywhere: 'Sign out everywhere',
      signedOut: 'You are signed out.',
      loading: 'Opening your account…',
      pageTitle: 'Your account — Arablyzer',
      pageDescription:
        'Your Arablyzer account: your saved sites and recent scans, signing out and deleting it.',
      unavailable: 'Accounts are not turned on on this site. Scanning works as usual without one.',
    },
    delete: {
      title: 'Delete account',
      text: 'This erases your account, your sessions, the email address and name we kept, your saved sites, and the scans you ran while signed in, with their reports. It cannot be undone. Scans you ran without signing in are not tied to your account and stay as they are.',
      open: 'Delete account…',
      confirm: 'Delete my account for good',
      cancel: 'Cancel',
      working: 'Deleting the account…',
      freshNeeded: 'To keep you safe, sign in again before deleting. It only takes a moment.',
      signInAgain: 'Sign in again',
      done: 'Your account was deleted.',
      doneDetail: 'We keep nothing about you.',
    },
    sites: {
      title: 'Your sites',
      lead: 'Save your sites to scan them from here in one click, and see their latest scans and scores.',
      count: (used, limit) => `${used} of ${limit} saved`,
      addLabel: 'Site URL',
      addPlaceholder: 'https://example.com',
      add: 'Save site',
      adding: 'Saving the site…',
      empty: 'You have not saved a site yet.',
      scanNow: 'Scan now',
      scanning: 'Starting the scan…',
      removeLabel: (url) => `Remove ${url} from your sites`,
      remove: 'Remove',
      notScanned: 'Not scanned yet',
      lastScan: 'Last scan',
      score: 'Score',
      noScore: 'No score',
      openReport: 'Open the report',
      historyTitle: 'Your recent scans',
      historyLead: (days) =>
        `We keep your scans for ${englishCount(days, 'day', 'days')}, then delete them.`,
      historyEmpty: 'You have not scanned anything while signed in yet.',
      states: {
        queued: 'Waiting',
        running: 'Running',
        complete: 'Done',
        partial: 'Partly done',
        failed: 'Failed',
      },
      loading: 'Opening your sites…',
    },
    monitor: {
      off: 'Not monitored',
      on: (days) => `Scanned automatically every ${englishCount(days, 'day', 'days')}`,
      nextRun: (date) => `Next scan: ${date}`,
      enable: 'Monitor this site',
      enabling: 'Turning monitoring on…',
      disable: 'Stop monitoring',
      disabling: 'Stopping monitoring…',
      paused: 'Monitoring is paused. Turn it off and on again to resume.',
      failing: 'The last scan could not reach the site.',
      limitReached: (limit) =>
        `Your plan monitors ${englishCount(limit, 'site', 'sites')}. Stop monitoring another to monitor this one.`,
      count: (used, limit) => `${used} of ${limit} monitored`,
      trendTitle: 'Latest results',
      trendLabel: (scores) => `Latest scores, oldest first: ${scores}`,
      noScore: 'No score',
    },
    alerts: {
      title: 'Alerts',
      lead: 'We send a message to the webhook you paste here when the score of a site you monitor drops, a new critical issue appears, or a scan fails. It works with Slack, Discord and any service that takes JSON.',
      webhookLabel: 'Webhook address',
      webhookPlaceholder: 'https://hooks.slack.com/services/…',
      webhookHint:
        'Paste the address from Slack, Discord or your own service. We never show it again after saving.',
      httpsOnly: 'We accept https addresses only.',
      save: 'Save alerts',
      saving: 'Saving…',
      saved: 'Alerts saved.',
      sendingTo: (host, kind) => `Sending to ${host} (${kind})`,
      kinds: { slack: 'Slack', discord: 'Discord', generic: 'generic JSON' },
      disabled:
        'This address was turned off after repeated failures. Send a test to turn it on again.',
      failures: (count) => `${englishCount(count, 'recent delivery', 'recent deliveries')} failed.`,
      remove: 'Remove the address',
      removing: 'Removing the address…',
      test: 'Send a test',
      testing: 'Sending…',
      testOk: 'Test sent. Check your channel.',
      testFailed: (status) =>
        status === null
          ? 'We could not reach the address. Check it and try again.'
          : `The address answered ${status} and did not accept the message.`,
      rotate: 'New signing secret',
      secretTitle: 'Signing secret',
      secretLead:
        'Every message carries an X-Arablyzer-Signature header, signed with this secret as in the formula below, and the time in X-Arablyzer-Timestamp. Copy the secret now; we will not show it again.',
      secretDone: 'I copied it',
      thresholdBefore: 'Alert me when the score drops by',
      thresholdAfter: 'points or more',
      onCritical: 'New critical findings',
      onDown: 'The site cannot be scanned',
      weeklySummary: 'Weekly summary',
      email: 'Email',
      loading: 'Opening alerts…',
    },
    problems: {
      'bad-request': 'We could not read that request. Reload the page and try again.',
      'rate-limited': 'Too many attempts.',
      unauthorized: 'You are not signed in.',
      'invalid-token': 'Google’s answer was not accepted. Try again.',
      'fresh-login-required': 'To keep you safe, sign in again, then try again.',
      'plan-limit':
        'You have reached the number of saved sites your plan allows. Remove one to save another.',
      'not-found': 'Accounts are not turned on on this site.',
      conflict:
        'You already have a deep crawl running. Wait for it to end or cancel it, then try again.',
      unavailable: 'The account service is not available right now. Try again in a moment.',
      network: 'We could not reach the service. Check your connection and try again.',
      unverified: 'Google did not confirm your email address, so we cannot sign you in with it.',
      cancelled: 'Sign-in was cancelled.',
      failed: 'Sign-in did not complete. Try again.',
    },
  },
}

import type { Copy } from './copy'

/**
 * The privacy policy, the terms and the security page (M5.3), written from what the product does
 * (docs/design/plans/m5.3-search-tools.md section 3). Short and factual; the owner and their
 * counsel review them (`reviewed: false`) and add the operator's legal details if they wish.
 * `code` in backticks, as in the other pages' copy.
 */
export interface LegalSection {
  readonly id: string
  readonly title: string
  readonly paragraphs?: readonly string[]
  readonly items?: readonly string[]
  /** A paragraph after the list. */
  readonly after?: readonly string[]
}

export interface LegalPageStrings {
  readonly meta: { readonly title: string; readonly description: string }
  readonly breadcrumb: string
  readonly title: string
  readonly intro: string
  readonly sections: readonly LegalSection[]
}

export interface LegalStrings {
  readonly contents: string
  readonly related: string
  /** «آخر تحديث» / "Last updated", before the date. */
  readonly updated: string
  readonly privacy: LegalPageStrings
  readonly terms: LegalPageStrings
  readonly security: LegalPageStrings
}

/** YYYY-MM-DD: the day the three pages were last changed. */
export const LEGAL_UPDATED = '2026-10-11'
export const PRIVACY_EMAIL = 'privacy@arablyzer.com'
export const SECURITY_EMAIL = 'security@arablyzer.com'

export const LEGAL_UI: Copy<LegalStrings> = {
  reviewed: false,
  ar: {
    contents: 'محتويات الصفحة',
    related: 'صفحات قريبة',
    updated: 'آخر تحديث',
    privacy: {
      meta: {
        title: 'سياسة الخصوصية — Arablyzer',
        description:
          'ماذا نحفظ من فحصك وحسابك، وماذا نقرأ من Google Search Console ولا نحفظه، والكوكيز، ومن يعالج بياناتك.',
      },
      breadcrumb: 'سياسة الخصوصية',
      title: 'سياسة الخصوصية',
      intro:
        'Arablyzer يفحص مواقع الويب. نكتب هنا بالتحديد ما نحفظه وما لا نحفظه، كما يعمل المنتج فعلاً، ونحدّث الصفحة حين يتغير.',
      sections: [
        {
          id: 'summary',
          title: 'الخلاصة',
          items: [
            'لا إعلانات، ولا أدوات تحليل لزوار الموقع، ولا بيع لأي بيانات.',
            'الفحص مجاني وبلا تسجيل، ولا يظهر تقريره في محركات البحث، ويفتحه من يملك رابطه فقط.',
            'بيانات Google Search Console نقرؤها للعرض فقط، ولا نحفظ منها ولا من رمز الدخول شيئاً.',
            'الحساب اختياري، وتستطيع حذفه بما فيه من بيانات في أي وقت.',
          ],
        },
        {
          id: 'scans',
          title: 'ما نحفظه عند الفحص',
          items: [
            'العنوان الذي أرسلته كما هو، بما فيه ما بعد علامة الاستفهام، فلا تضع فيه مفاتيح أو رموز دخول أو بيانات شخصية.',
            'التقرير: نتائج القواعد والقياسات وما استخرجناه من الصفحة العامة (النصوص القصيرة والعناوين وصور التوضيح)، تحت عنوان لا يمكن تخمينه.',
            'رمز حذف يُعطى لك مرة واحدة عند الفحص، ونحفظ منه بصمته فقط، ومن يملكه يحذف التقرير في أي وقت.',
            'نحذف التقارير بعد المدة التي يحددها مشغّل الخدمة بالأيام.',
          ],
          after: [
            'لا نحفظ عنوان IP الذي فحصتَ منه مع الفحص. ولمنع إساءة الاستعمال نعدّ طلبات كل عنوان ببصمة مشفّرة بمفتاح سرّي لا تعود إلى العنوان، وتنتهي بانتهاء مدة العدّ.',
          ],
        },
        {
          id: 'cookies',
          title: 'الكوكيز والتخزين في المتصفح',
          paragraphs: [
            'لا نضع كوكيز للتتبع أو الإعلان، ولا نخزّن شيئاً في المتصفح عن زيارتك. الكوكيز التي قد تُوضع وظيفية فقط:',
          ],
          items: [
            'كوكي الدخول، إن سجّلت الدخول فقط، ليبقيك مسجلاً.',
            '`arablyzer_gsc`، أثناء ربط Search Console فقط: كوكي موقّع يدوم 10 دقائق ولا تقرؤه الصفحات (HttpOnly)، يربط عودتك من Google بطلبك.',
          ],
          after: [
            'عند بدء الفحص تُحمَّل أداة Cloudflare Turnstile للتحقق من أنك إنسان، وقد تستعمل Cloudflare معلومات تقنية من متصفحك كما تشرح سياستها.',
          ],
        },
        {
          id: 'accounts',
          title: 'الحساب (اختياري)',
          paragraphs: [
            'الدخول بحساب Google وحده. نحفظ بريدك واسمك واللغة التي تختارها، والمواقع التي تحفظها، وفحوصك وأنت مسجّل الدخول مع تقاريرها (للمدة التي تحددها خطتك ثم نحذفها)، وإعدادات التنبيه إن وضعتها (بريد أو عنوان webhook)، ومفاتيح API (نحفظ منها بصمة فقط، وتُعرض لك مرة واحدة).',
            'لا نحفظ كلمة مرور، ولا صورة شخصية، ولا عنوان IP أو متصفح الجلسة، ولا شيئاً آخر من حساب Google. حذف الحساب من صفحته يمحو ذلك كله.',
          ],
        },
        {
          id: 'gsc',
          title: 'Google Search Console',
          paragraphs: [
            'حين تربط Search Console (من تقرير أو من أداة «كلماتك في جوجل») نطلب إذناً واحداً: قراءة فقط (`https://www.googleapis.com/auth/webmasters.readonly`). نقرأ قائمة مواقعك لنجد الموقع الذي طلبته، ثم لهذا الموقع وحده: مجموع آخر 28 يوماً (النقرات والظهور ونسبة النقر والترتيب)، وأعلى الكلمات (حتى 1000 في أداة الكلمات) والصفحات والبلدان، وفحص الفهرسة للصفحة في التقرير.',
          ],
          items: [
            'الإذن مؤقت (رمز وصول واحد بلا رمز تحديث)، نستعمله مرة واحدة ثم نلغيه عند Google فوراً، ولو فشلت القراءة.',
            'لا نخزّن البيانات: تنتظر النتيجة في مخزن مؤقت خمس دقائق وتُقرأ مرة واحدة فقط، ثم تُعرض في صفحتك وتختفي بإعادة التحميل.',
            'ما كتبتَه من نطاق وما يلزم لإكمال الربط يبقى 10 دقائق ثم يُمحى.',
            'لا نستعمل هذه البيانات لإعلان ولا لتدريب نماذج ولا نشاركها مع أحد.',
          ],
          after: [
            'استعمال Arablyzer للمعلومات التي يتلقاها من واجهات Google البرمجية ونقلها يلتزمان بسياسة بيانات مستخدمي خدمات Google API (Google API Services User Data Policy) بما فيها شروط الاستعمال المحدود (Limited Use). تستطيع سحب الإذن في أي وقت من صفحة أذونات حسابك في Google.',
          ],
        },
        {
          id: 'search-tools',
          title: 'أدوات اقتراحات جوجل ونتائجه',
          paragraphs: [
            'حين تُشغَّل أداتا «اقتراحات البحث العربية» و«من ينافسك في جوجل» تُرسَل الكلمة أو الاستعلامات التي كتبتها إلى Google من خادمنا (لا من متصفحك). لا نحفظ ما كتبت، ونحفظ في ذاكرة الخادم يوماً واحداً ردّ Google (الاقتراحات، أو نطاقات النتائج فقط بلا عناوين ولا نصوص) كي لا نسأله مرتين.',
          ],
        },
        {
          id: 'processors',
          title: 'من يعالج بياناتك',
          items: [
            'Google: الدخول بحسابك، وSearch Console، واقتراحات البحث ونتائجه حين تُشغَّل الأدوات.',
            'Cloudflare: التحقق من أنك إنسان (Turnstile)، وطلبات DNS عبر HTTPS لبعض الفحوص.',
            'مزوّد الاستضافة الذي يشغّل الخادم، والمواقع التي تفحصها: يصلها طلب من ArablyzerBot كما تشرح صفحته.',
          ],
        },
        {
          id: 'rights',
          title: 'حقوقك وكيف تتواصل',
          items: [
            'احذف تقريراً برمز الحذف الذي أُعطيته عند الفحص.',
            'احذف حسابك وكل ما فيه من صفحة الحساب.',
            'اسحب إذن Search Console من صفحة أذونات حسابك في Google.',
          ],
          after: [
            'لأي سؤال عن بياناتك أو طلب حذف: `privacy@arablyzer.com`. وقد نحدّث هذه الصفحة؛ يظهر تاريخ آخر تحديث أعلاها.',
          ],
        },
      ],
    },
    terms: {
      meta: {
        title: 'شروط الاستخدام — Arablyzer',
        description:
          'شروط استعمال Arablyzer: الخدمة، الاستعمال المقبول، التقارير، الحساب ومفاتيح API، أدوات Google، والمسؤولية.',
      },
      breadcrumb: 'شروط الاستخدام',
      title: 'شروط الاستخدام',
      intro:
        'باستعمالك Arablyzer توافق على هذه الشروط. كتبناها قصيرة وبسيطة؛ إن لم توافق فلا تستعمل الخدمة.',
      sections: [
        {
          id: 'service',
          title: 'الخدمة',
          paragraphs: [
            'Arablyzer أدوات مجانية تفحص مواقع الويب وتقيس ما يراه الزائر العربي فعلاً، من موقع وواجهة API وإضافة Chrome وإجراء GitHub. تشغّلها كلاود توبيا (CloudTopia). الشيفرة مفتوحة المصدر بترخيص AGPL-3.0 في مستودعها على GitHub.',
          ],
        },
        {
          id: 'use',
          title: 'الاستعمال المقبول',
          items: [
            'افحص مواقع لك أو مواقع عامة يجوز لك فحصها. ArablyzerBot يحترم robots.txt وطلبات المنع كما تشرح صفحته.',
            'لا تستعمل الخدمة لهجوم أو إغراق أو مسح للشبكات الداخلية، ولا لتجاوز الحدود المفروضة على الفحوص والطلبات.',
            'لا تستخدم الخدمة لجمع نتائج على نطاق واسع أو إعادة بيعها بطريقة آلية خارج واجهة API العامة وشروطها.',
            'لا تضع في العناوين التي تفحصها أسراراً أو بيانات شخصية: يظهر العنوان في تقريره، ويفتحه من يملك الرابط.',
          ],
          after: ['قد نحدّ من الاستعمال أو نوقفه حين نرى إساءة أو خطراً على الخدمة.'],
        },
        {
          id: 'reports',
          title: 'التقارير والأدوات',
          paragraphs: [
            'تُنتج التقارير آلياً من قواعد معلنة في صفحة المنهجية. هي إرشاد لا نصيحة قانونية ولا مهنية، ولا نعد بتحسّن ترتيب أو مبيعات. قد تخطئ القواعد أو تفوتها حالات، فتحقق قبل أن تبني عليها قراراً.',
          ],
        },
        {
          id: 'accounts',
          title: 'الحساب ومفاتيح API',
          paragraphs: [
            'الحساب اختياري ويكون بحساب Google. أنت مسؤول عن مفاتيح API التي تنشئها وعن حفظها وما يُفعل بها، وتستطيع إلغاءها وحذف حسابك في أي وقت. قد نغلق حساباً أو نلغي مفتاحاً يسيء الاستعمال.',
          ],
        },
        {
          id: 'google',
          title: 'خدمات Google',
          paragraphs: [
            'بيانات Search Console بيانات موقعك، ونقرؤها بإذنك للعرض فقط كما تشرح سياسة الخصوصية. أما أداتا اقتراحات البحث ونتائجه فتسألان صفحات Google العامة، وشروط Google لا تتيحها للاستعمال الآلي؛ لذلك هي مطفأة ما لم يفعّلها مشغّل الخدمة، وتُقدَّم كما هي وقد تتوقف أو تتغير في أي وقت. تسري شروط Google عليك حين تستعمل خدماتها.',
          ],
        },
        {
          id: 'liability',
          title: 'الضمان والمسؤولية',
          paragraphs: [
            'تُقدَّم الخدمة «كما هي» دون ضمان من أي نوع، ولا نضمن عملها دون انقطاع أو خطأ. بالقدر الذي يسمح به القانون لا نتحمل مسؤولية أي ضرر غير مباشر أو خسارة أرباح أو بيانات ناتجة عن استعمالها.',
          ],
        },
        {
          id: 'changes',
          title: 'التغيير والتواصل',
          paragraphs: [
            'قد نغيّر هذه الشروط، ويظهر تاريخ آخر تحديث أعلى الصفحة؛ استمرارك في الاستعمال بعده قبول لها. للاستفسار: `privacy@arablyzer.com`.',
          ],
        },
      ],
    },
    security: {
      meta: {
        title: 'الأمان والإبلاغ عن الثغرات — Arablyzer',
        description: 'كيف تبلّغ عن ثغرة في Arablyzer، ونطاق الإبلاغ، وما نفعله لحماية الخدمة.',
      },
      breadcrumb: 'الأمان',
      title: 'الأمان والإبلاغ عن الثغرات',
      intro: 'إن وجدت ثغرة في Arablyzer فأرسلها إلينا قبل أن تنشرها. نشكر كل من يبلّغ بحسن نية.',
      sections: [
        {
          id: 'report',
          title: 'كيف تبلّغ',
          paragraphs: [
            'راسلنا على `security@arablyzer.com` واكتب: ما وجدت ورابط الصفحة أو الطلب، وخطوات إعادته، وأثره في رأيك. لا ترفق بيانات أشخاص حقيقيين. إن أردت قناة مشفّرة فاطلبها في رسالتك الأولى. نسعى إلى الرد خلال خمسة أيام عمل، وإلى إخبارك بما نقرر.',
            'ملف `/.well-known/security.txt` فيه العنوان نفسه بالصيغة التي تقرؤها الأدوات.',
          ],
        },
        {
          id: 'scope',
          title: 'ما يدخل في النطاق',
          items: [
            'موقع arablyzer.com ومساراته، وواجهة `/api` وواجهة API العامة (v1) وخادم MCP.',
            'إجراء GitHub وإضافة Chrome من هذا المستودع.',
          ],
          after: [
            'خارج النطاق: ثغرات في المواقع التي يفحصها الزوار (بلّغ أصحابها)، والهندسة الاجتماعية، وإغراق الخدمة بالطلبات، ومخرجات ماسحات آلية بلا أثر مُثبَت، وملاحظات «أفضل الممارسات» التي لا أثر أمنياً لها.',
          ],
        },
        {
          id: 'rules',
          title: 'قواعد البحث الآمن',
          items: [
            'لا تصل إلى بيانات غيرك ولا تغيّرها ولا تحذفها أكثر مما يلزم لإثبات الثغرة.',
            'لا تعطّل الخدمة ولا تجرّب إغراقها.',
            'امنحنا وقتاً معقولاً لنصلح قبل أن تنشر التفاصيل.',
          ],
          after: ['ما دمت تتصرف بحسن نية وبهذه القواعد فلن نلاحقك قانونياً بسبب بحثك.'],
        },
        {
          id: 'protections',
          title: 'ما نفعله لحماية الخدمة',
          items: [
            'قواعد خروج صارمة: لا يصل الفحص إلى الشبكات الداخلية أو عناوين الخدمات الوصفية، وكل الاتصالات الخارجية تمر عبر وكيل خروج.',
            'واجهة الموقع تقبل الطلبات المغيِّرة من أصلها فقط وبصيغة JSON، وسياسة أمان المحتوى (CSP) على كل صفحة.',
            'لا نخزّن رموز Google: رمز Search Console مؤقت يُلغى فور استعماله.',
            'نحفظ مفاتيح API ورموز الحذف كبصمات فقط، ونحدّ الطلبات، ونتحقق من الزوار بـ Turnstile.',
            'الشيفرة مفتوحة، فيمكنك قراءة هذا كله.',
          ],
        },
      ],
    },
  },
  en: {
    contents: 'On this page',
    related: 'Related pages',
    updated: 'Last updated',
    privacy: {
      meta: {
        title: 'Privacy policy — Arablyzer',
        description:
          'What we keep of your scan and account, what we read from Google Search Console and do not keep, cookies, and who processes your data.',
      },
      breadcrumb: 'Privacy policy',
      title: 'Privacy policy',
      intro:
        'Arablyzer scans websites. This page says exactly what we keep and what we do not, as the product actually works, and we update it when that changes.',
      sections: [
        {
          id: 'summary',
          title: 'In short',
          items: [
            'No ads, no analytics on the site’s visitors, and no sale of any data.',
            'Scanning is free and needs no sign-up; its report is not shown in search engines and is opened only by whoever has its link.',
            'Google Search Console data is read for display only; we keep none of it, nor the access token.',
            'An account is optional, and you can delete it with its data at any time.',
          ],
        },
        {
          id: 'scans',
          title: 'What we keep when you scan',
          items: [
            'The address you sent, as sent, including anything after a “?”, so leave out keys, tokens and personal data.',
            'The report: the rules’ results, the measurements and what we extracted from the public page (short texts, headings, illustrative pictures), at an address that cannot be guessed.',
            'A deletion token, given to you once at the scan; we keep only its fingerprint, and whoever holds it can delete the report at any time.',
            'We delete reports after the number of days the service’s operator sets.',
          ],
          after: [
            'We do not keep the IP address you scanned from with the scan. To stop abuse we count each address’s requests with a fingerprint made with a secret key that cannot be turned back into the address, and it expires with the counting window.',
          ],
        },
        {
          id: 'cookies',
          title: 'Cookies and browser storage',
          paragraphs: [
            'We set no tracking or advertising cookies and store nothing in your browser about your visit. The cookies that may be set are functional only:',
          ],
          items: [
            'The sign-in cookie, only if you sign in, to keep you signed in.',
            '`arablyzer_gsc`, only while connecting Search Console: a signed cookie that lasts 10 minutes and that page scripts cannot read (HttpOnly), tying your return from Google to your request.',
          ],
          after: [
            'When you start a scan, Cloudflare Turnstile loads to check that you are a person, and Cloudflare may use technical information from your browser as its policy explains.',
          ],
        },
        {
          id: 'accounts',
          title: 'Accounts (optional)',
          paragraphs: [
            'Sign-in is with a Google account only. We keep your email, your name and the language you choose, the sites you save, the scans you run while signed in with their reports (for the period your plan sets, then we delete them), alert settings if you set them (an email or a webhook address) and API keys (we keep only a fingerprint of each; it is shown to you once).',
            'We keep no password, no profile picture, no IP address or browser of the session, and nothing else from your Google account. Deleting the account from its page erases all of this.',
          ],
        },
        {
          id: 'gsc',
          title: 'Google Search Console',
          paragraphs: [
            'When you connect Search Console (from a report or from the “Your keywords on Google” tool) we ask for one permission: read-only (`https://www.googleapis.com/auth/webmasters.readonly`). We read your list of sites to find the one you asked for, then for that site alone: the last 28 days’ totals (clicks, impressions, CTR, position), the top queries (up to 1,000 in the keywords tool), pages and countries, and the indexing inspection of the report’s page.',
          ],
          items: [
            'The permission is temporary (one access token, no refresh token); we use it once and revoke it at Google at once, even if the reading fails.',
            'We do not store the data: the result waits in a temporary store for five minutes and is read once, then shown on your page and gone when you reload.',
            'The domain you typed and what is needed to finish the connection are kept 10 minutes and then erased.',
            'We do not use this data for advertising or training models, and we share it with no one.',
          ],
          after: [
            'Arablyzer’s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. You can withdraw the permission at any time from your Google account’s permissions page.',
          ],
        },
        {
          id: 'search-tools',
          title: 'The Google suggestions and results tools',
          paragraphs: [
            'When the “Arabic search suggestions” and “Who competes with you on Google” tools are turned on, the word or queries you type are sent to Google from our server (not from your browser). We do not store what you type; we keep Google’s answer in the server’s memory for one day (the suggestions, or only the result domains with no addresses or texts) so that we do not ask twice.',
          ],
        },
        {
          id: 'processors',
          title: 'Who processes your data',
          items: [
            'Google: signing in with your account, Search Console, and the suggestions and results when the tools are on.',
            'Cloudflare: checking that you are a person (Turnstile), and DNS-over-HTTPS requests for some checks.',
            'The hosting provider that runs the server, and the sites you scan: they receive a request from ArablyzerBot as its page explains.',
          ],
        },
        {
          id: 'rights',
          title: 'Your rights and how to reach us',
          items: [
            'Delete a report with the deletion token you were given at the scan.',
            'Delete your account and everything in it from the account page.',
            'Withdraw the Search Console permission from your Google account’s permissions page.',
          ],
          after: [
            'For any question about your data or a deletion request: `privacy@arablyzer.com`. We may update this page; the date of the last update is at its top.',
          ],
        },
      ],
    },
    terms: {
      meta: {
        title: 'Terms of use — Arablyzer',
        description:
          'The terms for using Arablyzer: the service, acceptable use, reports, accounts and API keys, Google’s tools, and liability.',
      },
      breadcrumb: 'Terms of use',
      title: 'Terms of use',
      intro:
        'By using Arablyzer you agree to these terms. We wrote them short and plain; if you do not agree, do not use the service.',
      sections: [
        {
          id: 'service',
          title: 'The service',
          paragraphs: [
            'Arablyzer is free tools that scan websites and measure what an Arabic-speaking visitor actually sees, as a website, an API, a Chrome extension and a GitHub Action. CloudTopia runs it. The code is open source under AGPL-3.0 in its GitHub repository.',
          ],
        },
        {
          id: 'use',
          title: 'Acceptable use',
          items: [
            'Scan sites that are yours or public sites you may scan. ArablyzerBot respects robots.txt and opt-out requests as its page explains.',
            'Do not use the service to attack, flood or scan internal networks, or to get around the limits on scans and requests.',
            'Do not use the service to collect results at scale or resell them automatically outside the public API and its terms.',
            'Do not put secrets or personal data in the addresses you scan: the address appears in its report, and whoever has the link opens it.',
          ],
          after: ['We may limit or stop use that we see as abuse or a risk to the service.'],
        },
        {
          id: 'reports',
          title: 'Reports and tools',
          paragraphs: [
            'Reports are produced automatically from rules published on the methodology page. They are guidance, not legal or professional advice, and we promise no better ranking or sales. Rules can be wrong or miss cases, so check before you decide on them.',
          ],
        },
        {
          id: 'accounts',
          title: 'Accounts and API keys',
          paragraphs: [
            'An account is optional and uses a Google account. You are responsible for the API keys you create, for keeping them safe and for what is done with them, and you can revoke them and delete your account at any time. We may close an account or revoke a key that is abused.',
          ],
        },
        {
          id: 'google',
          title: 'Google’s services',
          paragraphs: [
            'Search Console data is your site’s data, and we read it with your permission for display only, as the privacy policy explains. The search suggestions and results tools ask Google’s public pages, and Google’s terms do not offer them for automated use; so they are off unless the service’s operator turns them on, and they are provided as they are and may stop or change at any time. Google’s terms apply to you when you use its services.',
          ],
        },
        {
          id: 'liability',
          title: 'Warranty and liability',
          paragraphs: [
            'The service is provided “as is” without warranty of any kind, and we do not promise that it runs without interruption or error. To the extent the law allows, we are not liable for indirect damage or lost profit or data arising from its use.',
          ],
        },
        {
          id: 'changes',
          title: 'Changes and contact',
          paragraphs: [
            'We may change these terms, and the date of the last update is at the top of the page; continuing to use the service afterwards accepts them. For questions: `privacy@arablyzer.com`.',
          ],
        },
      ],
    },
    security: {
      meta: {
        title: 'Security and reporting vulnerabilities — Arablyzer',
        description:
          'How to report a vulnerability in Arablyzer, the scope, and what we do to protect the service.',
      },
      breadcrumb: 'Security',
      title: 'Security and reporting vulnerabilities',
      intro:
        'If you find a vulnerability in Arablyzer, send it to us before you publish it. We thank everyone who reports in good faith.',
      sections: [
        {
          id: 'report',
          title: 'How to report',
          paragraphs: [
            'Write to `security@arablyzer.com` with what you found and the page or request, the steps to repeat it, and its impact in your view. Do not attach real people’s data. If you want an encrypted channel, ask for it in your first message. We aim to reply within five working days and to tell you what we decide.',
            'The file `/.well-known/security.txt` has the same address in the form tools read.',
          ],
        },
        {
          id: 'scope',
          title: 'What is in scope',
          items: [
            'The arablyzer.com site and its paths, the `/api` interface, the public API (v1) and the MCP server.',
            'The GitHub Action and the Chrome extension in this repository.',
          ],
          after: [
            'Out of scope: vulnerabilities in the sites that visitors scan (tell their owners), social engineering, flooding the service with requests, output of automated scanners with no proven impact, and “best practice” remarks with no security effect.',
          ],
        },
        {
          id: 'rules',
          title: 'Rules for safe research',
          items: [
            'Do not access, change or delete other people’s data beyond what is needed to prove the vulnerability.',
            'Do not disrupt the service or try to flood it.',
            'Give us reasonable time to fix before you publish details.',
          ],
          after: [
            'As long as you act in good faith and by these rules, we will not take legal action over your research.',
          ],
        },
        {
          id: 'protections',
          title: 'What we do to protect the service',
          items: [
            'Strict egress rules: a scan cannot reach internal networks or metadata addresses, and all outside connections go through an egress proxy.',
            'The site’s interface accepts state-changing requests only from its own origin and as JSON, and a content security policy (CSP) is on every page.',
            'We do not store Google tokens: the Search Console token is temporary and revoked as soon as it is used.',
            'We keep API keys and deletion tokens as fingerprints only, limit requests, and check visitors with Turnstile.',
            'The code is open, so you can read all of this.',
          ],
        },
      ],
    },
  },
}

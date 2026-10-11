import type { Copy } from './copy'

/**
 * The search-data tools (M5.3): «كلماتك في جوجل» (Search Console, account-free, nothing stored),
 * «اقتراحات البحث العربية» (Google's suggestions) and «من ينافسك في جوجل» (Google's results). Their
 * words, beside each tool's own copy (packages/tools), in the order the pages show them.
 */
export interface SearchStrings {
  readonly common: {
    /** A tool that asks Google's public pages while the operator has not turned it on. */
    readonly off: string
    readonly working: string
    readonly errors: Readonly<
      Record<
        'bad-request' | 'turnstile-failed' | 'rate-limited' | 'unavailable' | 'network',
        string
      >
    >
    readonly retryAfter: (seconds: number) => string
    readonly download: string
    readonly count: (n: number) => string
  }
  readonly keywords: {
    readonly siteLabel: string
    readonly sitePlaceholder: string
    readonly siteProblem: string
    readonly connect: string
    readonly intro: string
    readonly privacy: string
    readonly off: string
    readonly loading: string
    readonly denied: string
    readonly failed: string
    readonly gone: string
    readonly retry: string
    readonly noProperty: string
    readonly tryAnother: string
    readonly partial: string
    readonly truncated: (n: number) => string
    readonly shownOnce: string
    readonly clear: string
    readonly property: string
    readonly period: (start: string, end: string) => string
    readonly totals: {
      readonly clicks: string
      readonly impressions: string
      readonly ctr: string
      readonly position: string
      readonly none: string
    }
    readonly columns: {
      readonly query: string
      readonly clicks: string
      readonly impressions: string
      readonly ctr: string
      readonly position: string
    }
    readonly top: { readonly title: string; readonly none: string }
    readonly opportunities: {
      readonly title: string
      readonly intro: string
      readonly none: string
      readonly csv: string
    }
    readonly scripts: {
      readonly title: string
      readonly intro: (arabic: string) => string
      readonly arabic: string
      readonly latin: string
      readonly mixed: string
      readonly other: string
      readonly queries: string
      readonly none: string
    }
    readonly variants: {
      readonly title: string
      readonly intro: string
      readonly none: string
      readonly sum: (impressions: string) => string
    }
  }
  readonly suggest: {
    readonly seedLabel: string
    readonly seedPlaceholder: string
    readonly seedProblem: string
    readonly submit: string
    readonly sentOut: string
    readonly groups: Readonly<Record<'seed' | 'question' | 'letter', string>>
    readonly trigger: (kind: 'seed' | 'question' | 'letter', trigger: string) => string
    readonly filter: string
    readonly summary: (total: number, answered: number, asked: number) => string
    readonly empty: string
    readonly noMatch: string
    readonly stopped: Readonly<Record<'unreadable' | 'time', string>>
    readonly csvColumns: readonly [string, string, string]
    readonly csvName: string
  }
  readonly serp: {
    readonly queriesLabel: string
    readonly queriesHint: string
    readonly queriesProblem: string
    readonly domainLabel: string
    readonly domainProblem: string
    readonly submit: string
    readonly sentOut: string
    readonly outcomes: Readonly<Record<'blocked' | 'unreadable' | 'failed', string>>
    readonly position: (n: number) => string
    readonly arabic: string
    readonly notArabic: string
    readonly signals: Readonly<Record<'title' | 'tld', string>>
    readonly you: (position: number) => string
    readonly youAbsent: string
    readonly rivals: { readonly title: string; readonly intro: string; readonly none: string }
    readonly rivalQueries: (n: number) => string
    readonly rivalBest: (n: number) => string
    readonly summary: (arabic: number, total: number) => string
    readonly caveat: string
  }
}

export const SEARCH_UI: Copy<SearchStrings> = {
  reviewed: false,
  ar: {
    common: {
      off: 'هذه الأداة مطفأة الآن في هذه النسخة: تعمل حين يفعّلها مشغّل الخدمة، لأن شروط جوجل لا تتيح هذه الصفحة للاستخدام الآلي.',
      working: 'جارٍ العمل…',
      errors: {
        'bad-request': 'تحقق مما كتبت وحاول مرة أخرى.',
        'turnstile-failed': 'تعذّر التحقق من أنك إنسان. أعد المحاولة بعد قليل.',
        'rate-limited': 'بلغت حدّ الفحوص الآن.',
        unavailable: 'الخدمة غير متاحة الآن. حاول بعد قليل.',
        network: 'تعذّر الاتصال بالخدمة. تحقق من اتصالك وحاول مرة أخرى.',
      },
      retryAfter: (seconds) => `حاول بعد ${seconds} ثانية.`,
      download: 'نزّل CSV',
      count: (n) => `${n} نتيجة`,
    },
    keywords: {
      siteLabel: 'نطاق موقعك',
      sitePlaceholder: 'example.com',
      siteProblem: 'اكتب نطاق موقعك، مثل example.com.',
      connect: 'اربط Search Console',
      intro:
        'اكتب نطاق موقعك ثم اربط حساب جوجل الذي يملكه في Search Console. نقرأ كلماته مرة واحدة ونعرضها هنا.',
      privacy:
        'قراءة فقط. نقرأ البيانات مرة واحدة ونعرضها هنا، ولا نحفظ منها شيئاً، ونُلغي الإذن عند جوجل فور انتهاء القراءة.',
      off: 'الربط بـ Search Console غير مفعّل بعد في هذه النسخة، فلا يمكن استعمال هذه الأداة الآن.',
      loading: 'نقرأ كلماتك من Search Console…',
      denied: 'لم تسمح بالوصول، فلم نقرأ شيئاً. يمكنك المحاولة مرة أخرى متى شئت.',
      failed: 'تعذّرت قراءة Search Console. جرّب مرة أخرى بعد قليل.',
      gone: 'انتهت صلاحية هذه النتيجة: تُعرض مرة واحدة فقط. اربط من جديد لقراءتها.',
      retry: 'حاول مرة أخرى',
      noProperty:
        'ليس في هذا الحساب موقع في Search Console يطابق النطاق الذي كتبته. أضف الموقع وأثبت ملكيته، أو اربط حساباً آخر يملكه.',
      tryAnother: 'ابدأ من جديد',
      partial: 'لم يعطِنا جوجل بعض البيانات، فنعرض ما وصلنا منها.',
      truncated: (n) =>
        `قرأنا أعلى ${n} كلمة نقراً فقط، والقائمة أطول منها، ويُخفي جوجل الكلمات النادرة جداً.`,
      shownOnce: 'تُعرض هذه البيانات مرة واحدة في هذه الصفحة؛ وإعادة تحميلها تمحوها.',
      clear: 'أخفِ هذه البيانات',
      property: 'الموقع في Search Console',
      period: (start, end) => `آخر 28 يوماً، من ${start} إلى ${end}`,
      totals: {
        clicks: 'النقرات',
        impressions: 'مرات الظهور',
        ctr: 'نسبة النقر',
        position: 'متوسط الترتيب',
        none: 'لا بيانات بحث لهذا الموقع في هذه المدة.',
      },
      columns: {
        query: 'الكلمة',
        clicks: 'نقرات',
        impressions: 'ظهور',
        ctr: 'نسبة النقر',
        position: 'الترتيب',
      },
      top: { title: 'أكثر كلماتك نقراً', none: 'لا كلمات في هذه المدة.' },
      opportunities: {
        title: 'فرص قريبة',
        intro:
          'كلمات يقع موقعك فيها بين المركز 8 و20، أي على الصفحة الثانية أو قرب الأولى، مرتبة بالأكثر ظهوراً. هذه أرخص ما تكسبه: دفعة صغيرة لصفحة موجودة.',
        none: 'لا كلمات بين المركز 8 و20 بظهور كافٍ.',
        csv: 'نزّل الفرص CSV',
      },
      scripts: {
        title: 'العربية واللاتينية في كلماتك',
        intro: (arabic) => `${arabic} من ظهور كلماتك بحروف عربية.`,
        arabic: 'عربية',
        latin: 'لاتينية',
        mixed: 'مختلطة',
        other: 'أرقام ورموز',
        queries: 'كلمات',
        none: 'لا كلمات للتصنيف.',
      },
      variants: {
        title: 'كلمة واحدة بإملاءين',
        intro:
          'يبحث الناس عن الكلمة نفسها بإملاءين (همزة الألف، التاء المربوطة والهاء، الألف المقصورة والياء)، فيتوزع ظهورها. اكتب الإملاء الأكثر بحثاً في العنوان وذكّر بالآخر في النص.',
        none: 'لم نجد كلمات مكتوبة بإملاءين.',
        sum: (impressions) => `${impressions} ظهور معاً`,
      },
    },
    suggest: {
      seedLabel: 'كلمتك أو عبارتك',
      seedPlaceholder: 'قهوة عربية',
      seedProblem: 'اكتب كلمة أو عبارة قصيرة: من حرفين إلى أربع كلمات.',
      submit: 'اجلب الاقتراحات',
      sentOut:
        'الكلمة التي تكتبها وما نضيفه إليها (أداة سؤال أو حرف) تُرسل إلى جوجل من خادمنا باسم ArablyzerBot، ولا نحفظها. نحفظ ردّ جوجل يوماً في الذاكرة فقط.',
      groups: { seed: 'الكلمة نفسها', question: 'الأسئلة', letter: 'حسب الحرف' },
      trigger: (kind, trigger) =>
        kind === 'seed' ? 'الكلمة' : kind === 'question' ? `بعد «${trigger}»` : `بحرف ${trigger}`,
      filter: 'ابحث في الاقتراحات',
      summary: (total, answered, asked) =>
        `${total} اقتراحاً بلا تكرار، من ${answered} رداً من أصل ${asked} سؤالاً.`,
      empty: 'لم نصل إلى اقتراحات. جوجل لم يردّ بما نقرؤه.',
      noMatch: 'لا اقتراح يطابق بحثك.',
      stopped: {
        unreadable:
          'توقفنا لأن جوجل أعاد ردّاً لا نقرؤه (قد يكون حجب الطلبات أو غيّر صفحته)، فهذه ما جمعناه حتى تلك اللحظة.',
        time: 'توقفنا لانتهاء المدة، فهذه ما جمعناه.',
      },
      csvColumns: ['المجموعة', 'المُدخل', 'الاقتراح'],
      csvName: 'اقتراحات',
    },
    serp: {
      queriesLabel: 'الاستعلامات (واحد في كل سطر، حتى 5)',
      queriesHint: 'قهوة مختصة\nأفضل قهوة عربية',
      queriesProblem: 'اكتب من استعلام إلى خمسة، كل منها من حرفين إلى ثماني كلمات.',
      domainLabel: 'نطاقك (اختياري)',
      domainProblem: 'اكتب النطاق مثل example.com، أو اتركه فارغاً.',
      submit: 'اعرض المنافسين',
      sentOut:
        'الاستعلامات تُرسل إلى جوجل من خادمنا باسم ArablyzerBot، ولا نحفظها. نحفظ يوماً في الذاكرة قائمة النطاقات فقط، لا عناوين ولا نصوصاً.',
      outcomes: {
        blocked: 'طلب جوجل تحققاً أو صفحة موافقة ولم يعطِ النتائج، فتوقفنا. لا نحاول تجاوز ذلك.',
        unreadable: 'ردّ جوجل بصفحة لا نقرأ نتائجها (ربما تغيّرت).',
        failed: 'تعذّر الوصول إلى جوجل لهذا الاستعلام.',
      },
      position: (n) => `المركز ${n}`,
      arabic: 'موقع عربي',
      notArabic: 'غير معروف عربياً',
      signals: { title: 'عنوانه عربي', tld: 'لاحقة بلد عربي' },
      you: (position) => `نطاقك في المركز ${position}`,
      youAbsent: 'نطاقك ليس بين العشر الأولى',
      rivals: {
        title: 'المنافسون المتكررون',
        intro: 'نطاقات تظهر في استعلامين أو أكثر من استعلاماتك.',
        none: 'لا نطاق تكرر في أكثر من استعلام.',
      },
      rivalQueries: (n) => `في ${n} استعلامات`,
      rivalBest: (n) => `أفضل مركز ${n}`,
      summary: (arabic, total) => `${arabic} من ${total} نطاقاً مواقع عربية بحسب أداتنا.`,
      caveat:
        'هذه عينة قرأها خادمنا، لا ترتيبك الفعلي: يتغير الترتيب بالبلد والجهاز والحساب. للترتيب الفعلي استعمل «كلماتك في جوجل». ولا نعرف الموقع عربياً إلا بعنوانه أو بلاحقة نطاقه.',
    },
  },
  en: {
    common: {
      off: 'This tool is off in this installation: it runs when the service’s operator turns it on, because Google’s terms do not offer this page for automated use.',
      working: 'Working…',
      errors: {
        'bad-request': 'Check what you typed and try again.',
        'turnstile-failed': 'We could not check that you are a person. Try again in a moment.',
        'rate-limited': 'You have reached the limit of scans for now.',
        unavailable: 'The service is unavailable now. Try again in a moment.',
        network: 'We could not reach the service. Check your connection and try again.',
      },
      retryAfter: (seconds) => `Try again in ${seconds} seconds.`,
      download: 'Download CSV',
      count: (n) => `${n} results`,
    },
    keywords: {
      siteLabel: 'Your site’s domain',
      sitePlaceholder: 'example.com',
      siteProblem: 'Type your site’s domain, such as example.com.',
      connect: 'Connect Search Console',
      intro:
        'Type your site’s domain, then connect the Google account that owns it in Search Console. We read its queries once and show them here.',
      privacy:
        'Read-only. We read the data once and show it here. We store none of it, and we revoke the permission at Google as soon as the reading ends.',
      off: 'The Search Console connection is not turned on in this installation, so this tool cannot be used now.',
      loading: 'Reading your queries from Search Console…',
      denied: 'You did not allow access, so nothing was read. You can try again whenever you like.',
      failed: 'We could not read Search Console. Try again in a moment.',
      gone: 'This result has expired: it is shown once only. Connect again to read it.',
      retry: 'Try again',
      noProperty:
        'This account has no Search Console property that matches the domain you typed. Add the site and verify it, or connect an account that owns it.',
      tryAnother: 'Start again',
      partial: 'Google did not give us some of the data, so this shows what arrived.',
      truncated: (n) =>
        `We read only the top ${n} queries by clicks and the list is longer; Google also hides very rare queries.`,
      shownOnce: 'This data is shown once on this page; reloading it clears it.',
      clear: 'Hide this data',
      property: 'The property in Search Console',
      period: (start, end) => `The last 28 days, from ${start} to ${end}`,
      totals: {
        clicks: 'Clicks',
        impressions: 'Impressions',
        ctr: 'CTR',
        position: 'Average position',
        none: 'No search data for this site in this period.',
      },
      columns: {
        query: 'Query',
        clicks: 'Clicks',
        impressions: 'Impressions',
        ctr: 'CTR',
        position: 'Position',
      },
      top: { title: 'Your most clicked queries', none: 'No queries in this period.' },
      opportunities: {
        title: 'Near opportunities',
        intro:
          'Queries where your site sits between position 8 and 20, on page two or near page one, the most shown first. This is the cheapest thing you can win: a small push for a page you already have.',
        none: 'No queries between position 8 and 20 with enough impressions.',
        csv: 'Download opportunities CSV',
      },
      scripts: {
        title: 'Arabic and Latin in your queries',
        intro: (arabic) => `${arabic} of your queries’ impressions are in Arabic letters.`,
        arabic: 'Arabic',
        latin: 'Latin',
        mixed: 'Mixed',
        other: 'Digits and signs',
        queries: 'queries',
        none: 'No queries to classify.',
      },
      variants: {
        title: 'One word, two spellings',
        intro:
          'People search the same word in two spellings (alef hamza, ta marbuta and ha, alef maqsura and ya), which splits its impressions. Put the more searched spelling in the title and mention the other in the text.',
        none: 'We found no queries spelled two ways.',
        sum: (impressions) => `${impressions} impressions together`,
      },
    },
    suggest: {
      seedLabel: 'Your word or phrase',
      seedPlaceholder: 'قهوة عربية',
      seedProblem: 'Type a word or a short phrase: two characters to four words.',
      submit: 'Get the suggestions',
      sentOut:
        'The word you type and what we add to it (a question word or a letter) are sent to Google from our server as ArablyzerBot, and we do not store it. We keep Google’s answer for a day in memory only.',
      groups: { seed: 'The word itself', question: 'Questions', letter: 'By letter' },
      trigger: (kind, trigger) =>
        kind === 'seed'
          ? 'The word'
          : kind === 'question'
            ? `After “${trigger}”`
            : `Letter ${trigger}`,
      filter: 'Search the suggestions',
      summary: (total, answered, asked) =>
        `${total} suggestions without repeats, from ${answered} answers out of ${asked} questions.`,
      empty: 'We got no suggestions. Google did not answer in a form we read.',
      noMatch: 'No suggestion matches your search.',
      stopped: {
        unreadable:
          'We stopped because Google answered in a form we cannot read (it may have blocked requests or changed its page), so this is what we gathered until then.',
        time: 'We stopped because the time ran out, so this is what we gathered.',
      },
      csvColumns: ['Group', 'Trigger', 'Suggestion'],
      csvName: 'suggestions',
    },
    serp: {
      queriesLabel: 'Queries (one per line, up to 5)',
      queriesHint: 'قهوة مختصة\nأفضل قهوة عربية',
      queriesProblem: 'Type one to five queries, each two characters to eight words.',
      domainLabel: 'Your domain (optional)',
      domainProblem: 'Type the domain, such as example.com, or leave it empty.',
      submit: 'Show the rivals',
      sentOut:
        'The queries are sent to Google from our server as ArablyzerBot, and we do not store them. We keep the list of domains for a day in memory, with no addresses and no texts.',
      outcomes: {
        blocked:
          'Google asked for a check or a consent page and gave no results, so we stopped. We do not try to get around it.',
        unreadable:
          'Google answered with a page whose results we cannot read (it may have changed).',
        failed: 'We could not reach Google for this query.',
      },
      position: (n) => `Position ${n}`,
      arabic: 'Arabic site',
      notArabic: 'Not known as Arabic',
      signals: { title: 'Arabic title', tld: 'Arab country suffix' },
      you: (position) => `Your domain is at position ${position}`,
      youAbsent: 'Your domain is not in the first ten',
      rivals: {
        title: 'Recurring rivals',
        intro: 'Domains that appear in two or more of your queries.',
        none: 'No domain recurred in more than one query.',
      },
      rivalQueries: (n) => `in ${n} queries`,
      rivalBest: (n) => `best position ${n}`,
      summary: (arabic, total) => `${arabic} of ${total} domains are Arabic sites by our tool.`,
      caveat:
        'This is a sample read by our server, not your actual rank: ranking varies by country, device and account. For your real rank use “Your keywords on Google”. We know a site as Arabic only by its title or its domain suffix.',
    },
  },
}

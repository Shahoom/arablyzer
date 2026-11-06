import type { Copy } from './copy'

/**
 * The generators and paste tools made of a form and an answer (M10.1, TextTool): what their forms
 * ask and what they answer, a block for each tool. They run in the visitor's browser: nothing
 * typed leaves it. The shared words (copy, copied, result) are GENERATORS_UI's.
 */
export interface TextToolsStrings {
  readonly slug: {
    readonly title: string
    readonly titleHint: string
    readonly base: string
    readonly baseHint: string
    readonly submit: string
    readonly slug: string
    readonly encoded: string
    readonly url: string
    readonly empty: string
    readonly badBase: string
    readonly truncated: string
    readonly marks: string
    readonly digits: string
    readonly clean: string
  }
  readonly errors: {
    readonly message: string
    readonly hint: string
    readonly submit: string
    readonly empty: string
    readonly cause: string
    readonly fix: string
    readonly tool: string
    readonly unknown: string
    readonly known: string
  }
  readonly robots: {
    readonly paths: string
    readonly pathsHint: string
    readonly training: string
    readonly search: string
    readonly allow: string
    readonly block: string
    readonly sitemaps: string
    readonly sitemapsHint: string
    readonly submit: string
    readonly file: string
    readonly asks: string
    readonly trainingBlocked: string
    readonly searchBlocked: string
    readonly problems: Readonly<
      Record<'path-blank' | 'path-bad' | 'sitemap-bad', (input: string) => string>
    >
  }
  readonly sitemap: {
    readonly urls: string
    readonly urlsHint: string
    readonly submit: string
    readonly file: string
    readonly count: (count: number) => string
    readonly empty: string
    readonly skipped: Readonly<
      Record<
        'not-url' | 'other-host' | 'duplicate' | 'bad-date' | 'too-many',
        (line: number) => string
      >
    >
  }
  readonly sitemapDiff: {
    readonly before: string
    readonly after: string
    readonly submit: string
    readonly notSitemap: (side: string) => string
    readonly summary: (added: number, removed: number, changed: number, unchanged: number) => string
    readonly added: string
    readonly removed: string
    readonly changed: string
    readonly more: (count: number) => string
    readonly same: string
    readonly dated: (before: string, after: string) => string
  }
  readonly redirects: {
    readonly pairs: string
    readonly pairsHint: string
    readonly submit: string
    readonly empty: string
    readonly flat: string
    readonly summary: (count: number, flattened: number) => string
    readonly problems: Readonly<
      Record<
        'unreadable' | 'same' | 'clash' | 'loop' | 'chain' | 'unsafe' | 'duplicate' | 'other-host',
        (line: number, text: string) => string
      >
    >
    readonly target: string
    readonly targets: Readonly<Record<'apache' | 'nginx' | 'redirects-file' | 'vercel', string>>
    readonly status: string
    readonly statuses: Readonly<Record<'301' | '302' | '307' | '308', string>>
    readonly site: string
    readonly siteHint: string
    readonly badSite: string
    readonly config: string
    readonly whereTo: Readonly<Record<'apache' | 'nginx' | 'redirects-file' | 'vercel', string>>
  }
  readonly meta: {
    readonly lang: string
    readonly langs: Readonly<Record<'ar' | 'en', string>>
    readonly title: string
    readonly description: string
    readonly url: string
    readonly siteName: string
    readonly image: string
    readonly robots: string
    readonly robotsOptions: Readonly<Record<'index' | 'noindex', string>>
    readonly type: string
    readonly types: Readonly<Record<'website' | 'article', string>>
    readonly submit: string
    readonly htmlTag: string
    readonly head: string
    readonly lengths: (title: number, description: number) => string
    readonly problems: Readonly<Record<'title-blank' | 'url-bad' | 'image-bad', string>>
    readonly noImage: string
    readonly empty: string
  }
  readonly serp: {
    readonly title: string
    readonly description: string
    readonly url: string
    readonly submit: string
    readonly empty: string
    readonly note: string
    readonly titleCut: string
    readonly descriptionCut: string
    readonly fits: string
  }
  readonly title: {
    readonly title: string
    readonly hint: string
    readonly submit: string
    readonly fixed: string
    readonly empty: string
    readonly unchanged: string
    readonly length: (count: number, max: number) => string
    readonly changes: Readonly<Record<'tatweel' | 'promotion' | 'caps' | 'spaces' | 'long', string>>
  }
}

export const TEXT_TOOLS_UI: Copy<TextToolsStrings> = {
  reviewed: false,
  ar: {
    slug: {
      title: 'عنوان الصفحة',
      titleHint: 'اكتبه كما هو، بالعربية أو الإنجليزية، وبحركاته إن كانت فيه.',
      base: 'بداية العنوان (اختيارية)',
      baseHint: 'مثل https://example.com/products/ لنعرض العنوان كاملاً.',
      submit: 'اكتب الجزء',
      slug: 'الجزء كما يظهر في شريط العنوان',
      encoded: 'الجزء كما يُرسل (مرمَّز)',
      url: 'العنوان كاملاً',
      empty: 'لا حرف ولا رقم في هذا العنوان. اكتب كلمة واحدة على الأقل.',
      badBase: 'بداية العنوان ليست رابطاً يبدأ بـ https:// أو http://.',
      truncated: 'العنوان أطول من 100 حرف، فقُطع عند آخر كلمة تامة تتسع له.',
      marks: 'حُذفت الحركات والتطويل من العنوان: الكلمة بها وبدونها عنوانان.',
      digits: 'حُوّلت الأرقام العربية الشرقية إلى 0–9.',
      clean: 'الجزء يجتاز فحص الأجزاء في Arablyzer: بلا علامات ولا فواصل غريبة، وفي الحد.',
    },
    errors: {
      message: 'نص الرسالة',
      hint: 'الصق الرسالة من Search Console أو Merchant Center كما تظهر لك، بالعربية أو الإنجليزية.',
      submit: 'فسّر الرسالة',
      empty: 'الصق نص الرسالة.',
      cause: 'السبب المعتاد',
      fix: 'ما الذي تفعله',
      tool: 'افحص صفحتك بالأداة المناسبة',
      unknown:
        'لم نتعرف على هذه الرسالة. ألصق عنوانها كما يظهر في Search Console، أو اختر من الرسائل التي نعرفها.',
      known: 'الرسائل التي نعرفها',
    },
    robots: {
      paths: 'مسارات تمنع الزواحف منها',
      pathsHint: 'مساراً في كل سطر، مثل /admin/ و/cart/. اتركه فارغاً إن لم تمنع شيئاً.',
      training: 'زواحف تدريب الذكاء الاصطناعي (GPTBot وClaudeBot وGoogle-Extended…)',
      search: 'زواحف بحث الذكاء الاصطناعي (OAI-SearchBot وPerplexityBot…)',
      allow: 'اسمح',
      block: 'امنع',
      sitemaps: 'عناوين خرائط الموقع',
      sitemapsHint: 'عنواناً كاملاً في كل سطر، مثل https://example.com/sitemap.xml.',
      submit: 'اكتب الملف',
      file: 'ملف robots.txt',
      asks: 'ملف robots.txt يطلب ولا يُجبر: تلتزم به الزواحف المحترمة، وما يجب إخفاؤه فعلاً يُحمى بكلمة مرور لا بهذا الملف.',
      trainingBlocked: 'منع زواحف التدريب لا يؤثر في ظهورك في بحث Google.',
      searchBlocked:
        'منع زواحف بحث الذكاء الاصطناعي يعني ألا تقرأ المساعدات صفحاتك لتجيب منها ولا تنقلها إلى مستخدميها.',
      problems: {
        'path-blank': () => '',
        'path-bad': (input) =>
          `تُرك المسار «${input}» خارج الملف: فيه مسافة أو علامة لا تصلح في المسار.`,
        'sitemap-bad': (input) =>
          `تُرك «${input}» خارج الملف: ليس عنواناً كاملاً يبدأ بـ https:// أو http://.`,
      },
    },
    sitemap: {
      urls: 'العناوين',
      urlsHint: 'عنواناً في كل سطر. يمكن أن يتبعه تاريخ آخر تعديل بصيغة 2026-03-05.',
      submit: 'اكتب الخريطة',
      file: 'ملف sitemap.xml',
      count: (count) => `${String(count)} عنواناً في الخريطة.`,
      empty: 'لا عنوان صالحاً في ما كتبت. اكتب عنواناً كاملاً في كل سطر.',
      skipped: {
        'not-url': (line) =>
          `السطر ${String(line)}: ليس عنواناً كاملاً يبدأ بـ https:// أو http://.`,
        'other-host': (line) =>
          `السطر ${String(line)}: من موقع غير موقع أول عنوان، والخريطة تحمل عناوين موقع واحد.`,
        duplicate: (line) => `السطر ${String(line)}: عنوان مكرر.`,
        'bad-date': (line) => `السطر ${String(line)}: تاريخ غير صالح، وصيغته 2026-03-05.`,
        'too-many': (line) => `السطر ${String(line)}: بعد أقصى ما تحمله الخريطة (50 ألف عنوان).`,
      },
    },
    sitemapDiff: {
      before: 'الخريطة القديمة (XML)',
      after: 'الخريطة الجديدة (XML)',
      submit: 'قارن',
      notSitemap: (side) => `${side} ليست خريطة موقع: لا urlset فيها ولا sitemapindex.`,
      summary: (added, removed, changed, unchanged) =>
        `أُضيف ${String(added)}، وحُذف ${String(removed)}، وتغيّر تاريخ ${String(changed)}، وبقي كما هو ${String(unchanged)}.`,
      added: 'أُضيفت',
      removed: 'حُذفت',
      changed: 'تغيّر تاريخها',
      more: (count) => `و${String(count)} غيرها لم تُعرض.`,
      same: 'الخريطتان تحملان العناوين والتواريخ نفسها.',
      dated: (before, after) => `من ${before || 'بلا تاريخ'} إلى ${after || 'بلا تاريخ'}`,
    },
    redirects: {
      pairs: 'التحويلات',
      pairsHint:
        'سطراً لكل تحويل: القديم ثم الجديد، يفصل بينهما مسافة أو فاصلة أو سهم. المسار يبدأ بشرطة مائلة، أو العنوان كاملاً.',
      submit: 'افحص التحويلات',
      empty: 'لا تحويل صالحاً في ما كتبت.',
      flat: 'التحويلات بعد التسوية',
      summary: (count, flattened) =>
        `${String(count)} تحويلاً صالحاً${flattened > 0 ? `، منها ${String(flattened)} كانت سلسلة صارت مباشرة` : ''}.`,
      problems: {
        unreadable: (line, text) =>
          `السطر ${String(line)}: لم نفهمه («${text}»). اكتب القديم ثم الجديد.`,
        same: (line) => `السطر ${String(line)}: يحوّل المسار إلى نفسه.`,
        clash: (line) =>
          `السطر ${String(line)}: المسار نفسه له تحويل آخر إلى هدف مختلف في سطر قبله. بقي الأول.`,
        loop: (line, text) =>
          `السطر ${String(line)}: حلقة لا تنتهي (${text}). لم يدخل التحويل في النتيجة.`,
        chain: (line, text) =>
          `السطر ${String(line)}: سلسلة (${text}). صار التحويل مباشرة إلى النهاية.`,
        unsafe: (line, text) =>
          `السطر ${String(line)}: فيه ما لا نكتبه في إعدادات الخادم («${text}»): مسافة أو علامة اقتباس أو قوس أو فاصلة منقوطة أو نحوها، أو علامة استعلام أو نجمة في المسار القديم.`,
        duplicate: (line) => `السطر ${String(line)}: تحويل مكرر. تُرك.`,
        'other-host': (line) => `السطر ${String(line)}: من موقع آخر غير موقع أول عنوان كامل كتبته.`,
      },
      target: 'اكتب الإعدادات لـ',
      targets: {
        apache: 'Apache (ملف .htaccess)',
        nginx: 'nginx',
        'redirects-file': 'Cloudflare Pages وNetlify (ملف _redirects)',
        vercel: 'Vercel (ملف vercel.json)',
      },
      status: 'رمز الحالة',
      statuses: {
        '301': '301: دائم (الأشهر)',
        '302': '302: مؤقت',
        '307': '307: مؤقت ويحفظ طريقة الطلب',
        '308': '308: دائم ويحفظ طريقة الطلب',
      },
      site: 'عنوان موقعك (اختياري)',
      siteHint: 'مثل https://example.com. إن كتبته صارت الأهداف عناوين كاملة.',
      badSite: 'عنوان الموقع ليس رابطاً يبدأ بـ https:// أو http://.',
      config: 'الإعدادات',
      whereTo: {
        apache: 'ضعها في ملف .htaccess في جذر الموقع، وجرّب رابطاً قديماً بعدها.',
        nginx: 'ضعها داخل كتلة server ثم أعد تحميل nginx بعد أن تفحص الإعداد بالأمر nginx -t.',
        'redirects-file': 'احفظها في ملف باسم _redirects في مجلد النشر.',
        vercel: 'احفظها في ملف vercel.json في جذر المشروع، أو ادمجها مع ما فيه.',
      },
    },
    meta: {
      lang: 'لغة الصفحة',
      langs: { ar: 'العربية (من اليمين إلى اليسار)', en: 'الإنجليزية (من اليسار إلى اليمين)' },
      title: 'عنوان الصفحة',
      description: 'وصف الصفحة',
      url: 'عنوان الصفحة (العنوان المرجعي)',
      siteName: 'اسم الموقع',
      image: 'عنوان صورة المشاركة',
      robots: 'الفهرسة',
      robotsOptions: { index: 'تُفهرس (الافتراضي)', noindex: 'لا تُفهرس' },
      type: 'نوع الصفحة',
      types: { website: 'صفحة عادية', article: 'مقال' },
      submit: 'اكتب الوسوم',
      htmlTag: 'وسم html',
      head: 'وسوم head',
      lengths: (title, description) =>
        `طول العنوان ${String(title)} حرفاً، وطول الوصف ${String(description)}. تقطع Google العنوان بعرضه لا بعدد حروفه وقد تعيد كتابته؛ ومعاينة النتيجة تريك ذلك.`,
      problems: {
        'title-blank': 'اكتب عنوان الصفحة: بدونه لا يصلح الوسم.',
        'url-bad': 'تُرك العنوان المرجعي: ليس رابطاً كاملاً يبدأ بـ https:// أو http://.',
        'image-bad': 'تُركت الصورة: عنوانها ليس رابطاً كاملاً.',
      },
      noImage: 'لا صورة للمشاركة: تظهر المشاركة بلا صورة، ويطلب فحص وسوم المشاركة صورة.',
      empty: 'اكتب العنوان.',
    },
    serp: {
      title: 'عنوان الصفحة',
      description: 'وصف الصفحة',
      url: 'عنوان الصفحة',
      submit: 'اعرض المعاينة',
      empty: 'اكتب عنوان الصفحة.',
      note: 'معاينة تقريبية: تقطع Google العنوان بحسب عرضه وقد تعيد كتابة العنوان والوصف. حدّ العرض الذي نستعمله هو المتعارف عليه بين أدوات البحث لا رقم من Google.',
      titleCut: 'العنوان أطول من عرض النتيجة المتعارف عليه فقُطع.',
      descriptionCut: 'الوصف أطول من أن يظهر كله فقُطع.',
      fits: 'العنوان والوصف يظهران كاملين في هذه المعاينة.',
    },
    title: {
      title: 'عنوان المنتج',
      hint: 'كما هو في متجرك أو ملف المنتجات، عربياً أو إنجليزياً.',
      submit: 'أصلح العنوان',
      fixed: 'العنوان بعد الإصلاح',
      empty: 'اكتب عنوان المنتج.',
      unchanged: 'لا شيء يستدعي الإصلاح: العنوان نظيف بحسب ما نفحصه.',
      length: (count, max) => `طول العنوان ${String(count)} حرفاً، والحد الأعلى ${String(max)}.`,
      changes: {
        tatweel: 'حُذف التطويل من الكلمات العربية.',
        promotion:
          'حُذف العرض من العنوان (الشحن المجاني أو الخصم أو نحوه): مكانه حقول السعر والشحن في الملف.',
        caps: 'كُتبت الأحرف الإنجليزية الكبيرة كلمات عادية.',
        spaces: 'ضُغطت المسافات الزائدة.',
        long: 'العنوان أطول من الحد، فقُطع عند آخر كلمة تامة.',
      },
    },
  },
  en: {
    slug: {
      title: 'Page title',
      titleHint: 'Type it as it is, in Arabic or English, with its harakat if it has any.',
      base: 'Start of the address (optional)',
      baseHint: 'Such as https://example.com/products/, to see the whole address.',
      submit: 'Write the slug',
      slug: 'The slug as the address bar shows it',
      encoded: 'The slug as it is sent (encoded)',
      url: 'The whole address',
      empty: 'There is no letter or digit in this title. Type at least one word.',
      badBase: 'The start of the address is not a link beginning with https:// or http://.',
      truncated:
        'The title is longer than 100 characters, so it stops at the last whole word that fits.',
      marks:
        'The harakat and tatweel were taken out: a word with them and without them is two addresses.',
      digits: 'Eastern Arabic digits were turned into 0–9.',
      clean:
        'The slug passes Arablyzer’s slug check: no marks, no odd separators, within the limit.',
    },
    errors: {
      message: 'The message',
      hint: 'Paste the message from Search Console or Merchant Center as it shows, in Arabic or English.',
      submit: 'Explain the message',
      empty: 'Paste the message.',
      cause: 'The usual cause',
      fix: 'What to do',
      tool: 'Check your page with the matching tool',
      unknown:
        'We did not recognise this message. Paste its heading as Search Console shows it, or pick from the ones we know.',
      known: 'The messages we know',
    },
    robots: {
      paths: 'Paths to keep crawlers out of',
      pathsHint: 'One path to a line, such as /admin/ and /cart/. Leave it empty to block nothing.',
      training: 'AI training crawlers (GPTBot, ClaudeBot, Google-Extended…)',
      search: 'AI search crawlers (OAI-SearchBot, PerplexityBot…)',
      allow: 'Allow',
      block: 'Block',
      sitemaps: 'Sitemap addresses',
      sitemapsHint: 'One full address to a line, such as https://example.com/sitemap.xml.',
      submit: 'Write the file',
      file: 'robots.txt',
      asks: 'robots.txt asks and does not enforce: well-behaved crawlers keep to it, and what must be hidden is protected with a password, not with this file.',
      trainingBlocked:
        'Blocking the training crawlers does not affect your appearance in Google search.',
      searchBlocked:
        'Blocking the AI search crawlers means assistants will not read your pages to answer from them or pass them on to their users.',
      problems: {
        'path-blank': () => '',
        'path-bad': (input) =>
          `The path “${input}” was left out of the file: it has a space or a character a path cannot hold.`,
        'sitemap-bad': (input) =>
          `“${input}” was left out of the file: it is not a full address beginning with https:// or http://.`,
      },
    },
    sitemap: {
      urls: 'The addresses',
      urlsHint:
        'One address to a line. It can be followed by its last-modified date, written 2026-03-05.',
      submit: 'Write the sitemap',
      file: 'sitemap.xml',
      count: (count) => `${String(count)} addresses in the sitemap.`,
      empty: 'There is no valid address in what you typed. Type a full address on each line.',
      skipped: {
        'not-url': (line) =>
          `Line ${String(line)}: not a full address beginning with https:// or http://.`,
        'other-host': (line) =>
          `Line ${String(line)}: on another site than the first address; a sitemap holds one site’s addresses.`,
        duplicate: (line) => `Line ${String(line)}: an address already in the list.`,
        'bad-date': (line) => `Line ${String(line)}: not a valid date; write it 2026-03-05.`,
        'too-many': (line) =>
          `Line ${String(line)}: past the most a sitemap holds (50,000 addresses).`,
      },
    },
    sitemapDiff: {
      before: 'The old sitemap (XML)',
      after: 'The new sitemap (XML)',
      submit: 'Compare',
      notSitemap: (side) => `${side} is not a sitemap: it has no urlset or sitemapindex.`,
      summary: (added, removed, changed, unchanged) =>
        `${String(added)} added, ${String(removed)} removed, ${String(changed)} with a new date, ${String(unchanged)} unchanged.`,
      added: 'Added',
      removed: 'Removed',
      changed: 'Date changed',
      more: (count) => `and ${String(count)} more, not shown.`,
      same: 'The two sitemaps hold the same addresses and dates.',
      dated: (before, after) => `from ${before || 'no date'} to ${after || 'no date'}`,
    },
    redirects: {
      pairs: 'The redirects',
      pairsHint:
        'One redirect to a line: the old address, then the new, with a space, a comma or an arrow between. A path begins with a slash, or give the full address.',
      submit: 'Check the redirects',
      empty: 'There is no valid redirect in what you typed.',
      flat: 'The redirects after flattening',
      summary: (count, flattened) =>
        `${String(count)} valid redirects${flattened > 0 ? `, of which ${String(flattened)} were chains and now go straight to the end` : ''}.`,
      problems: {
        unreadable: (line, text) =>
          `Line ${String(line)}: not understood (“${text}”). Write the old address, then the new.`,
        same: (line) => `Line ${String(line)}: redirects a path to itself.`,
        clash: (line) =>
          `Line ${String(line)}: the same path already redirects elsewhere in an earlier line. The first was kept.`,
        loop: (line, text) =>
          `Line ${String(line)}: a loop that never ends (${text}). It is not in the result.`,
        chain: (line, text) =>
          `Line ${String(line)}: a chain (${text}). It now goes straight to the end.`,
        unsafe: (line, text) =>
          `Line ${String(line)}: has what we do not write into a server’s config (“${text}”): a space, a quote, a bracket, a semicolon and the like, or a query or a star in the old path.`,
        duplicate: (line) => `Line ${String(line)}: a repeated redirect. Left out.`,
        'other-host': (line) =>
          `Line ${String(line)}: on another site than the first full address you wrote.`,
      },
      target: 'Write the config for',
      targets: {
        apache: 'Apache (.htaccess file)',
        nginx: 'nginx',
        'redirects-file': 'Cloudflare Pages and Netlify (_redirects file)',
        vercel: 'Vercel (vercel.json file)',
      },
      status: 'Status code',
      statuses: {
        '301': '301: permanent (the usual one)',
        '302': '302: temporary',
        '307': '307: temporary, keeps the request method',
        '308': '308: permanent, keeps the request method',
      },
      site: 'Your site’s address (optional)',
      siteHint: 'Such as https://example.com. If you give it, the targets are full addresses.',
      badSite: 'The site’s address is not a link beginning with https:// or http://.',
      config: 'The config',
      whereTo: {
        apache: 'Put it in the .htaccess file at the site’s root, then try an old address.',
        nginx: 'Put it inside the server block, check it with nginx -t, then reload nginx.',
        'redirects-file': 'Save it in a file named _redirects in the folder you publish.',
        vercel: 'Save it as vercel.json at the project’s root, or merge it with what is there.',
      },
    },
    meta: {
      lang: 'The page’s language',
      langs: { ar: 'Arabic (right to left)', en: 'English (left to right)' },
      title: 'The page’s title',
      description: 'The page’s description',
      url: 'The page’s address (its canonical)',
      siteName: 'The site’s name',
      image: 'Address of the sharing image',
      robots: 'Indexing',
      robotsOptions: { index: 'Indexed (the default)', noindex: 'Not indexed' },
      type: 'Kind of page',
      types: { website: 'An ordinary page', article: 'An article' },
      submit: 'Write the tags',
      htmlTag: 'The html tag',
      head: 'The head tags',
      lengths: (title, description) =>
        `The title is ${String(title)} characters and the description ${String(description)}. Google cuts a title by its width, not its characters, and may rewrite it; the result preview shows you.`,
      problems: {
        'title-blank': 'Type the page’s title: the tags are not right without it.',
        'url-bad':
          'The canonical was left out: it is not a full link beginning with https:// or http://.',
        'image-bad': 'The image was left out: its address is not a full link.',
      },
      noImage:
        'There is no sharing image: a share shows without a picture, and the sharing-tags check asks for one.',
      empty: 'Type the title.',
    },
    serp: {
      title: 'The page’s title',
      description: 'The page’s description',
      url: 'The page’s address',
      submit: 'Show the preview',
      empty: 'Type the page’s title.',
      note: 'An approximate preview: Google cuts a title by its width and may rewrite the title and the description. The width limit we use is the one search tools commonly use, not a number from Google.',
      titleCut: 'The title is longer than the commonly used result width, so it is cut.',
      descriptionCut: 'The description is too long to show whole, so it is cut.',
      fits: 'The title and the description show whole in this preview.',
    },
    title: {
      title: 'Product title',
      hint: 'As it is in your store or product file, in Arabic or English.',
      submit: 'Fix the title',
      fixed: 'The title after the fix',
      empty: 'Type the product’s title.',
      unchanged: 'Nothing to fix: the title is clean as far as we check.',
      length: (count, max) =>
        `The title is ${String(count)} characters; the limit is ${String(max)}.`,
      changes: {
        tatweel: 'Tatweel was taken out of the Arabic words.',
        promotion:
          'The offer was taken out of the title (free shipping, a discount and the like): its place is the price and shipping fields of the file.',
        caps: 'Capital English letters were written as ordinary words.',
        spaces: 'Extra spaces were squeezed.',
        long: 'The title was over the limit, so it stops at the last whole word.',
      },
    },
  },
}

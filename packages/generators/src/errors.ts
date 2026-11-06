// The error decoder (M10.1): the messages Google Search Console and Merchant Center give a site,
// in the words of Google's own help pages, with what each means and what to do, in both languages.
// A message is found by its English wording or the stems of the Arabic interface's; a message that
// matches nothing is answered with the whole list.

export type ErrorId =
  | 'crawled-not-indexed'
  | 'discovered-not-indexed'
  | 'duplicate-no-canonical'
  | 'duplicate-other-canonical'
  | 'alternate-canonical'
  | 'noindex'
  | 'blocked-robots'
  | 'indexed-blocked-robots'
  | 'soft-404'
  | 'not-found'
  | 'redirect'
  | 'redirect-error'
  | 'server-error'
  | 'forbidden'
  | 'submitted-problem'
  | 'sitemap-fetch'
  | 'missing-field'
  | 'invalid-value'
  | 'mismatched-price'
  | 'mismatched-availability'
  | 'missing-image'
  | 'gtin'
  | 'landing-page'
  | 'lcp'
  | 'cls'
  | 'inp'

interface Words {
  /** The message as Google words it (or close), shown as the answer's heading. */
  readonly name: string
  readonly means: string
  readonly cause: string
  readonly fix: readonly string[]
}

export interface ErrorEntry {
  readonly id: ErrorId
  /** Patterns on the folded text: any one finds it. */
  readonly match: readonly RegExp[]
  /** The Arablyzer tool that checks it on a page, if one does. */
  readonly tool: string | null
  readonly ar: Words
  readonly en: Words
}

export const ERRORS: readonly ErrorEntry[] = [
  {
    id: 'crawled-not-indexed',
    match: [
      /crawled\s*[-–—]?\s*currently not indexed/i,
      /تم الزحف.*لم تتم الفهرسة|تم الزحف.*غير مفهرس/,
    ],
    tool: 'indexability-check',
    en: {
      name: 'Crawled – currently not indexed',
      means:
        'Google fetched the page but chose not to put it in its index yet. It may be indexed later, or not at all.',
      cause:
        'Usually the page is thin, near-duplicate of others, or has little linking to it, so Google sees little reason to keep it. It is not an error in the page’s code.',
      fix: [
        'Check that the page is not noindexed and that its canonical points to itself.',
        'Make the page worth indexing: its own useful text, a clear title and headings, and links to it from pages Google already indexes.',
        'Do not resubmit it again and again: asking for indexing does not change Google’s decision.',
      ],
    },
    ar: {
      name: 'تم الزحف – لم تتم الفهرسة حاليًا',
      means: 'جلبت Google الصفحة لكنها لم تضعها في فهرسها بعد، وقد تفهرسها لاحقاً وقد لا تفعل.',
      cause:
        'غالباً تكون الصفحة قليلة المحتوى أو قريبة الشبه بغيرها أو قليلة الروابط إليها، فلا ترى Google سبباً لإبقائها. وليس الخلل في كود الصفحة.',
      fix: [
        'تأكد أن الصفحة بلا noindex وأن عنوانها المرجعي هو نفسها.',
        'اجعل الصفحة تستحق الفهرسة: نص مفيد خاص بها، وعنوان وعناوين فرعية واضحة، وروابط إليها من صفحات مفهرسة.',
        'لا تكرر طلب الفهرسة: لا يغيّر الطلب قرار Google.',
      ],
    },
  },
  {
    id: 'discovered-not-indexed',
    match: [
      /discovered\s*[-–—]?\s*currently not indexed/i,
      /تم الاكتشاف.*لم تتم الفهرسة|تم العثور.*غير مفهرس/,
    ],
    tool: 'sitemap-check',
    en: {
      name: 'Discovered – currently not indexed',
      means:
        'Google knows the address (from a sitemap or a link) but has not fetched the page yet.',
      cause:
        'Google postpones the visit when it thinks the site may be overloaded, or when the address looks low in value among many. It is common for new sites and sites with very many addresses.',
      fix: [
        'Make the server fast and stable, so Google fetches more.',
        'Link to the page from your main pages, and keep thin or duplicate addresses out of the sitemap.',
        'Wait: Google fetches these in its own time.',
      ],
    },
    ar: {
      name: 'تم الاكتشاف – لم تتم الفهرسة حاليًا',
      means: 'تعرف Google العنوان (من خريطة موقع أو رابط) لكنها لم تجلب الصفحة بعد.',
      cause:
        'تؤجّل Google الزيارة إذا ظنت أن الموقع قد يُرهَق، أو إذا بدا العنوان قليل القيمة بين عناوين كثيرة. وهذا شائع في المواقع الجديدة والمواقع ذات العناوين الكثيرة جداً.',
      fix: [
        'اجعل الخادم سريعاً ومستقراً لتجلب Google أكثر.',
        'اربط الصفحة من صفحاتك الرئيسية، وأبقِ العناوين الضعيفة أو المكررة خارج خريطة الموقع.',
        'انتظر: تجلب Google هذه الصفحات في وقتها.',
      ],
    },
  },
  {
    id: 'duplicate-no-canonical',
    match: [
      /duplicate without user[- ]selected canonical/i,
      /نسخة مكررة.*بدون.*(مرجعي|canonical)|مكررة.*لم يحدد المستخدم/,
    ],
    tool: 'canonical-check',
    en: {
      name: 'Duplicate without user-selected canonical',
      means:
        'The page has duplicates and you did not say which one is the main one, so Google chose.',
      cause:
        'The same content is reachable at more than one address and no canonical link tells Google which to keep.',
      fix: [
        'Add `<link rel="canonical" href="…">` to each page, pointing to the address you want in search.',
        'Redirect with 301 the addresses that should not exist (with and without www, with a slash or not).',
      ],
    },
    ar: {
      name: 'نسخة مكررة بدون تحديد المستخدم لعنوان مرجعي',
      means: 'للصفحة نسخ مكررة ولم تحدد أيها الأصل، فاختارت Google.',
      cause: 'يصل المحتوى نفسه من أكثر من عنوان ولا رابط مرجعي يخبر Google أيها تُبقي.',
      fix: [
        'أضف `<link rel="canonical" href="…">` في كل صفحة يشير إلى العنوان الذي تريده في البحث.',
        'حوّل بـ 301 العناوين التي لا يجب أن توجد (بـ www وبدونها، وبشرطة مائلة وبدونها).',
      ],
    },
  },
  {
    id: 'duplicate-other-canonical',
    match: [
      /duplicate,? google chose different canonical/i,
      /مكررة.*اختارت.*google.*مرجعي|اختارت google عنوانا مرجعيا مختلفا/i,
    ],
    tool: 'canonical-check',
    en: {
      name: 'Duplicate, Google chose different canonical than user',
      means: 'You named a canonical address, but Google judged another address to be the main one.',
      cause:
        'Your canonical is only a hint. Google overrides it when the pages differ in what you say and what it sees: other addresses are linked more, are in the sitemap, or the pages are too alike.',
      fix: [
        'Open the page’s inspection in Search Console and see which address Google chose.',
        'Make the signals agree: the canonical, the links on your site, the sitemap and the redirects should all name the same address.',
        'If two pages are the same product or article, merge them with a 301 redirect.',
      ],
    },
    ar: {
      name: 'نسخة مكررة، اختارت Google عنواناً مرجعياً غير الذي حددته',
      means: 'سمّيت عنواناً مرجعياً، لكن Google رأت عنواناً آخر هو الأصل.',
      cause:
        'عنوانك المرجعي مجرد إشارة. تتجاوزه Google إذا اختلف ما تقوله عمّا تراه: عنوان آخر تكثر الروابط إليه أو يرد في خريطة الموقع، أو الصفحتان متشابهتان جداً.',
      fix: [
        'افتح فحص عنوان الصفحة في Search Console وانظر أي عنوان اختارته Google.',
        'اجعل الإشارات متفقة: العنوان المرجعي وروابط موقعك وخريطة الموقع والتحويلات كلها تسمّي العنوان نفسه.',
        'إن كانت الصفحتان المنتج نفسه أو المقال نفسه فادمجهما بتحويل 301.',
      ],
    },
  },
  {
    id: 'alternate-canonical',
    match: [/alternate page with proper canonical/i, /صفحة بديلة.*مرجعي/],
    tool: 'canonical-check',
    en: {
      name: 'Alternate page with proper canonical tag',
      means: 'The page points to another page as its canonical, and Google follows it.',
      cause: 'This is how it should be for a duplicate, a variant or a tracking address.',
      fix: ['Nothing to fix. If you wanted this page in search, change its canonical to itself.'],
    },
    ar: {
      name: 'صفحة بديلة بعنوان مرجعي سليم',
      means: 'تشير الصفحة إلى صفحة أخرى عنواناً مرجعياً لها، وتتبعه Google.',
      cause: 'هذا هو المطلوب في النسخة المكررة أو المتغيرة أو عنوان التتبع.',
      fix: ['لا شيء يُصلح. وإن أردت هذه الصفحة في البحث فاجعل عنوانها المرجعي نفسها.'],
    },
  },
  {
    id: 'noindex',
    match: [/excluded by .?noindex.? tag/i, /noindex/i, /مستبعدة.*noindex|وسم.*noindex/i],
    tool: 'indexability-check',
    en: {
      name: 'Excluded by ‘noindex’ tag',
      means: 'The page tells Google not to index it, and Google obeys.',
      cause:
        'A `noindex` in a robots meta tag or in an `X-Robots-Tag` header, often left from a staging site or set by a platform’s “hide from search” switch.',
      fix: [
        'If the page should be in search: remove the `noindex` (check the page source and the response headers) and ask for indexing.',
        'Do not also block the page in robots.txt: Google then cannot see that you removed it.',
      ],
    },
    ar: {
      name: 'مستبعدة بوسم noindex',
      means: 'تطلب الصفحة من Google ألا تفهرسها، وتطيع Google.',
      cause:
        'وجود `noindex` في وسم robots أو في ترويسة `X-Robots-Tag`، وكثيراً ما يبقى من نسخة التجربة أو يضعه مفتاح «إخفاء من البحث» في المنصة.',
      fix: [
        'إن كان يجب أن تظهر الصفحة في البحث: احذف `noindex` (افحص مصدر الصفحة وترويسات الرد) واطلب الفهرسة.',
        'ولا تحجبها كذلك في robots.txt: فلا ترى Google أنك حذفته.',
      ],
    },
  },
  {
    id: 'blocked-robots',
    match: [/blocked by robots\.?txt/i, /محظور.*robots|تم الحظر.*robots\.?txt|حجب.*robots/i],
    tool: 'robots-tester',
    en: {
      name: 'Blocked by robots.txt',
      means: 'Your robots.txt tells Googlebot not to fetch the page.',
      cause:
        'A `Disallow` rule that matches the address, often a broad one such as `/` or `/*?`, or one a platform adds.',
      fix: [
        'Test the address against your robots.txt and find the rule that matches.',
        'Edit that rule, or add a more specific `Allow` for the page.',
        'To keep a page out of search, use `noindex`, not robots.txt: a blocked page can still be listed from links.',
      ],
    },
    ar: {
      name: 'محظورة بملف robots.txt',
      means: 'يطلب ملف robots.txt من Googlebot ألا يجلب الصفحة.',
      cause:
        'قاعدة `Disallow` تطابق العنوان، وكثيراً ما تكون واسعة مثل `/` أو `/*?` أو تضيفها المنصة.',
      fix: [
        'اختبر العنوان على ملف robots.txt واعرف القاعدة المطابقة.',
        'عدّل تلك القاعدة أو أضف `Allow` أخص للصفحة.',
        'ولإبقاء صفحة خارج البحث استعمل `noindex` لا robots.txt: قد تُعرض الصفحة المحجوبة من الروابط إليها.',
      ],
    },
  },
  {
    id: 'indexed-blocked-robots',
    match: [/indexed,? though blocked by robots/i, /مفهرسة.*رغم.*(حظر|robots)/],
    tool: 'robots-tester',
    en: {
      name: 'Indexed, though blocked by robots.txt',
      means:
        'Google listed the address from links to it, but cannot read the page because robots.txt blocks it.',
      cause: 'The block stops the fetch, not the listing: the result shows with no description.',
      fix: [
        'To keep it out of search: let Google fetch the page and add `noindex`, then block it later if you must.',
        'To keep it in search: remove the `Disallow` that matches.',
      ],
    },
    ar: {
      name: 'مفهرسة رغم حظرها بملف robots.txt',
      means: 'أدرجت Google العنوان من روابط إليه لكنها لا تقرأ الصفحة لأن robots.txt يحجبها.',
      cause: 'الحجب يمنع الجلب لا الإدراج: تظهر النتيجة بلا وصف.',
      fix: [
        'لإبقائها خارج البحث: اسمح لـ Google بجلب الصفحة وأضف `noindex`، ثم احجبها بعد ذلك إن لزم.',
        'وإن أردتها في البحث: احذف قاعدة `Disallow` المطابقة.',
      ],
    },
  },
  {
    id: 'soft-404',
    match: [/soft 404/i, /خطأ 404 (الناعم|الوهمي)|صفحة 404 وهمية|soft-404/i],
    tool: 'soft-404-check',
    en: {
      name: 'Soft 404',
      means: 'The page answers “200 OK” but looks like a “not found” page or an empty one.',
      cause:
        'A removed product or empty category that still returns a normal page with a “not available” message, or a page with almost no content.',
      fix: [
        'If the page is gone for good: return a real 404 or 410.',
        'If it moved: redirect with 301 to the closest page.',
        'If it should exist: give it real content.',
      ],
    },
    ar: {
      name: 'خطأ 404 ناعم (Soft 404)',
      means: 'ترد الصفحة بـ «200 OK» لكنها تبدو صفحة «غير موجود» أو صفحة فارغة.',
      cause:
        'منتج محذوف أو تصنيف فارغ يرد صفحة عادية برسالة «غير متوفر»، أو صفحة بلا محتوى تقريباً.',
      fix: [
        'إن كانت الصفحة زالت نهائياً: أعد 404 أو 410 حقيقياً.',
        'وإن انتقلت: حوّل بـ 301 إلى أقرب صفحة.',
        'وإن كان يجب أن توجد: أعطها محتوى حقيقياً.',
      ],
    },
  },
  {
    id: 'not-found',
    match: [
      /not found \(404\)/i,
      /\b404\b.*(not found|غير موجود)|لم يتم العثور.*404|غير موجودة \(404\)/i,
    ],
    tool: 'redirect-chain-check',
    en: {
      name: 'Not found (404)',
      means: 'The address answers 404: no page.',
      cause: 'A page that was deleted, an address that changed, or a link that was mistyped.',
      fix: [
        'If the page was removed on purpose: leave the 404; Google drops it with time.',
        'If it moved: redirect with 301 to the new address.',
        'If it should exist: bring it back, and fix the links that point to a wrong address.',
      ],
    },
    ar: {
      name: 'لم يتم العثور عليها (404)',
      means: 'يردّ العنوان 404: لا صفحة هناك.',
      cause: 'صفحة حُذفت أو عنوان تغيّر أو رابط كُتب خطأً.',
      fix: [
        'إن حُذفت الصفحة قصداً: اترك 404، وتتركها Google مع الوقت.',
        'وإن انتقلت: حوّل بـ 301 إلى العنوان الجديد.',
        'وإن كان يجب أن توجد: أعدها وأصلح الروابط التي تشير إلى عنوان خطأ.',
      ],
    },
  },
  {
    id: 'redirect',
    match: [/page with redirect/i, /صفحة.*(بها|تحتوي على) إعادة توجيه|صفحة مع إعادة توجيه/],
    tool: 'redirect-chain-check',
    en: {
      name: 'Page with redirect',
      means: 'The address redirects to another, so Google indexes the target instead.',
      cause: 'This is normal for an old address that now redirects.',
      fix: [
        'Nothing to fix if the redirect is on purpose.',
        'Update your links and sitemap to the final address, and keep to one hop: a chain of redirects wastes crawling.',
      ],
    },
    ar: {
      name: 'صفحة بها إعادة توجيه',
      means: 'يحوّل العنوان إلى عنوان آخر، فتفهرس Google الهدف بدلاً منه.',
      cause: 'هذا طبيعي لعنوان قديم يُحوَّل الآن.',
      fix: [
        'لا شيء يُصلح إن كان التحويل مقصوداً.',
        'حدّث روابطك وخريطة الموقع إلى العنوان النهائي، وأبقِ التحويل خطوة واحدة: السلسلة تهدر الزحف.',
      ],
    },
  },
  {
    id: 'redirect-error',
    match: [/redirect error/i, /خطأ في إعادة التوجيه|خطأ إعادة التوجيه/],
    tool: 'redirect-chain-check',
    en: {
      name: 'Redirect error',
      means: 'Google could not follow the redirect.',
      cause: 'A loop, a chain that is too long, or a redirect to an empty or invalid address.',
      fix: [
        'Request the address and follow each hop to find where it loops or ends.',
        'Point the address straight to the final page with one 301.',
      ],
    },
    ar: {
      name: 'خطأ في إعادة التوجيه',
      means: 'لم تستطع Google اتباع التحويل.',
      cause: 'حلقة، أو سلسلة طويلة جداً، أو تحويل إلى عنوان فارغ أو غير صالح.',
      fix: [
        'اطلب العنوان وتتبّع كل خطوة لتعرف أين يدور أو ينتهي.',
        'اجعل العنوان يشير مباشرة إلى الصفحة النهائية بتحويل 301 واحد.',
      ],
    },
  },
  {
    id: 'server-error',
    match: [/server error \(5xx\)/i, /\b5\d\d\b.*(server|خادم)|خطأ في الخادم/i],
    tool: 'tls-check',
    en: {
      name: 'Server error (5xx)',
      means: 'The server failed when Google asked for the page.',
      cause:
        'An overloaded or crashed server, a timeout, or a rule in the firewall that blocks Googlebot.',
      fix: [
        'Open the address yourself and check the server’s logs at the time Search Console shows.',
        'Make sure the firewall or the bot protection lets Googlebot through.',
        'Once it is fixed, Google tries again by itself.',
      ],
    },
    ar: {
      name: 'خطأ في الخادم (5xx)',
      means: 'فشل الخادم حين طلبت Google الصفحة.',
      cause: 'خادم مثقل أو متوقف، أو مهلة انتهت، أو قاعدة في جدار الحماية تحجب Googlebot.',
      fix: [
        'افتح العنوان بنفسك وراجع سجلات الخادم وقت ما يعرضه Search Console.',
        'تأكد أن جدار الحماية أو حماية البوتات تسمح لـ Googlebot بالمرور.',
        'وبعد الإصلاح تعيد Google المحاولة وحدها.',
      ],
    },
  },
  {
    id: 'forbidden',
    match: [
      /blocked due to (unauthorized request \(401\)|access forbidden \(403\))/i,
      /\b40[13]\b.*(forbidden|unauthorized|محظور|غير مصرح)/i,
    ],
    tool: 'ai-access',
    en: {
      name: 'Blocked due to unauthorized request (401) or access forbidden (403)',
      means: 'The server refused Googlebot: it asked for a login or said “forbidden”.',
      cause:
        'A page behind a login, or a firewall or bot protection that treats Googlebot as a bot.',
      fix: [
        'If the page is public: let Googlebot through the firewall (verify it by Google’s published ranges, not the user-agent alone).',
        'If it is private: leave it, and keep it out of the sitemap.',
      ],
    },
    ar: {
      name: 'محظورة بسبب طلب غير مصرّح (401) أو ممنوعة (403)',
      means: 'رفض الخادم Googlebot: طلب تسجيل دخول أو قال «ممنوع».',
      cause: 'صفحة خلف تسجيل دخول، أو جدار حماية أو حماية بوتات تعامل Googlebot بوتاً غريباً.',
      fix: [
        'إن كانت الصفحة عامة: اسمح لـ Googlebot بالمرور (وتحقق منه بنطاقات Google المنشورة لا بالـ user-agent وحده).',
        'وإن كانت خاصة: اتركها وأبعدها عن خريطة الموقع.',
      ],
    },
  },
  {
    id: 'submitted-problem',
    match: [
      /submitted url (not found|marked .?noindex.?|seems to be a soft 404|blocked by robots|returned unauthorized)/i,
      /العنوان المرسل|عنوان URL المُرسَل|عنوان url المرسل/i,
    ],
    tool: 'sitemap-check',
    en: {
      name: 'Submitted URL not found, noindex, soft 404 or blocked',
      means: 'Your sitemap lists an address that has a problem, so Google cannot index it.',
      cause:
        'A sitemap should hold only addresses you want indexed. These are addresses that answer 404, carry noindex, are blocked or look empty.',
      fix: [
        'Take out of the sitemap every address that is not a good, indexable page.',
        'Or fix the address: restore it, remove the noindex, or unblock it.',
      ],
    },
    ar: {
      name: 'عنوان مُرسَل غير موجود أو noindex أو 404 ناعم أو محظور',
      means: 'خريطة موقعك فيها عنوان فيه مشكلة فلا تفهرسه Google.',
      cause:
        'يجب أن تحوي الخريطة العناوين التي تريد فهرستها فقط. وهذه عناوين ترد 404 أو فيها noindex أو محجوبة أو تبدو فارغة.',
      fix: [
        'أخرج من الخريطة كل عنوان ليس صفحة جيدة قابلة للفهرسة.',
        'أو أصلح العنوان: أعده، أو احذف noindex، أو ارفع الحجب.',
      ],
    },
  },
  {
    id: 'sitemap-fetch',
    match: [
      /couldn.?t fetch|sitemap (could not|can.?t) be read|sitemap is html|has errors/i,
      /تعذّر (جلب|الجلب)|تعذر جلب|لا يمكن قراءة.*خريطة/i,
    ],
    tool: 'sitemap-check',
    en: {
      name: 'Sitemap could not be fetched or read',
      means: 'Google could not get the sitemap, or could not read it as a sitemap.',
      cause:
        'A wrong address, a robots.txt or firewall block, a page that is HTML instead of XML, or invalid XML.',
      fix: [
        'Open the sitemap address in a browser: it should show XML.',
        'Make sure it is not blocked and returns 200.',
        'Check it is valid: the right namespace, full https addresses, UTF-8.',
      ],
    },
    ar: {
      name: 'تعذّر جلب خريطة الموقع أو قراءتها',
      means: 'لم تستطع Google الحصول على الخريطة، أو لم تستطع قراءتها خريطة موقع.',
      cause:
        'عنوان خطأ، أو حجب في robots.txt أو جدار الحماية، أو صفحة HTML بدل XML، أو XML غير صالح.',
      fix: [
        'افتح عنوان الخريطة في المتصفح: يجب أن يظهر XML.',
        'تأكد أنها غير محجوبة وترد 200.',
        'تحقق من صلاحيتها: المساحة الاسمية الصحيحة، وعناوين https كاملة، وترميز UTF-8.',
      ],
    },
  },
  {
    id: 'missing-field',
    match: [/missing field/i, /حقل.*(مفقود|ناقص)|الحقل.*غير موجود/i],
    tool: 'product-schema-check',
    en: {
      name: 'Missing field (“price”, “offers”, “name” and so on)',
      means:
        'The structured data of the page (usually Product) lacks a field the rich result needs.',
      cause:
        'The theme or app writes an incomplete Product, or leaves out `offers` when a product has no price.',
      fix: [
        'Add the missing field to the page’s JSON-LD, with the value the page shows.',
        'On a platform: update the theme or app that writes the structured data, or turn on its product schema.',
      ],
    },
    ar: {
      name: 'حقل مفقود («price» أو «offers» أو «name» وغيرها)',
      means: 'تنقص البيانات المنظّمة في الصفحة (غالباً Product) حقلاً تحتاجه النتيجة المنسّقة.',
      cause: 'يكتب القالب أو التطبيق Product ناقصاً، أو يحذف `offers` حين لا سعر للمنتج.',
      fix: [
        'أضف الحقل الناقص إلى JSON-LD في الصفحة بالقيمة التي تعرضها الصفحة.',
        'وفي المنصة: حدّث القالب أو التطبيق الذي يكتب البيانات المنظّمة أو فعّل مخطط المنتج فيه.',
      ],
    },
  },
  {
    id: 'invalid-value',
    match: [
      /invalid (value|object|type) in field|invalid value(?! \[?(gtin|price))/i,
      /قيمة (غير صالحة|غير صحيحة)/i,
    ],
    tool: 'structured-data-check',
    en: {
      name: 'Invalid value in a field',
      means: 'A field of the structured data holds a value in a form Google does not accept.',
      cause:
        'A price with a currency symbol or Arabic digits («١٢٠»), a currency that is not an ISO code, or availability in words instead of the schema.org URL.',
      fix: [
        'Write the price as a number with a full stop (`120.00`), the currency as `SAR`, `AED`, `OMR`…',
        'Write availability as the schema.org address (`https://schema.org/InStock`).',
      ],
    },
    ar: {
      name: 'قيمة غير صالحة في حقل',
      means: 'في حقل من البيانات المنظّمة قيمة بصيغة لا تقبلها Google.',
      cause:
        'سعر فيه رمز عملة أو أرقام عربية («١٢٠»)، أو عملة ليست رمز ISO، أو توفّر مكتوب بالكلمات بدل عنوان schema.org.',
      fix: [
        'اكتب السعر رقماً بنقطة (`120.00`) والعملة `SAR` أو `AED` أو `OMR`…',
        'واكتب التوفّر بعنوان schema.org (`https://schema.org/InStock`).',
      ],
    },
  },
  {
    id: 'mismatched-price',
    match: [/mismatched value.*price|price.*mismatch/i, /عدم تطابق.*السعر|السعر.*غير مطابق/i],
    tool: 'product-page-check',
    en: {
      name: 'Mismatched value (page crawl): price',
      means: 'The price in your feed differs from the price on the product page.',
      cause:
        'A feed that updates less often than the page, a price shown with tax on the page and without it in the feed, a currency or a market that differs, or a sale that ends.',
      fix: [
        'Make the feed read the same price as the page: same tax treatment and same currency.',
        'Refresh the feed more often, or use automatic item updates in Merchant Center.',
      ],
    },
    ar: {
      name: 'قيمة غير متطابقة (زحف الصفحة): السعر',
      means: 'سعر المنتج في الملف يختلف عن سعره في صفحة المنتج.',
      cause:
        'ملف يتحدّث أبطأ من الصفحة، أو سعر يظهر في الصفحة بضريبته وفي الملف بدونها، أو عملة أو سوق مختلف، أو تخفيض انتهى.',
      fix: [
        'اجعل الملف يقرأ السعر نفسه في الصفحة: المعاملة الضريبية نفسها والعملة نفسها.',
        'حدّث الملف أكثر، أو فعّل التحديث التلقائي للعناصر في Merchant Center.',
      ],
    },
  },
  {
    id: 'mismatched-availability',
    match: [
      /mismatched value.*availability|availability.*mismatch/i,
      /عدم تطابق.*التوفر|التوفر.*غير مطابق/i,
    ],
    tool: 'product-page-check',
    en: {
      name: 'Mismatched value (page crawl): availability',
      means: 'The stock status in your feed differs from the page.',
      cause:
        'A feed that does not follow the store’s stock, or a page that shows “out of stock” only after a script runs.',
      fix: [
        'Make the feed’s `availability` follow the store’s stock closely, and refresh it often.',
        'Show the stock status in the page’s HTML, not only after a script runs.',
      ],
    },
    ar: {
      name: 'قيمة غير متطابقة (زحف الصفحة): التوفّر',
      means: 'حالة المخزون في الملف تختلف عن الصفحة.',
      cause: 'ملف لا يتبع مخزون المتجر، أو صفحة لا تُظهر «نفد المخزون» إلا بعد تشغيل سكربت.',
      fix: [
        'اجعل `availability` في الملف يتبع مخزون المتجر عن قرب وحدّثه كثيراً.',
        'أظهر حالة المخزون في HTML الصفحة لا بعد تشغيل سكربت فقط.',
      ],
    },
  },
  {
    id: 'missing-image',
    match: [
      /missing value \[?image link\]?|image link/i,
      /رابط الصورة.*(مفقود|ناقص)|قيمة مفقودة.*الصورة/i,
    ],
    tool: 'feed-check',
    en: {
      name: 'Missing value [image link] or image problems',
      means: 'A product has no image address in the feed, or Google cannot fetch it.',
      cause:
        'The product has no image, the export does not map it, or the image is private or blocked.',
      fix: [
        'Map the product image to `image_link` in the feed, as a full `https://` address.',
        'Open the address in a browser without logging in: it should show the image.',
      ],
    },
    ar: {
      name: 'قيمة مفقودة [رابط الصورة] أو مشكلة في الصورة',
      means: 'ليس للمنتج عنوان صورة في الملف، أو لا تستطيع Google جلبها.',
      cause: 'لا صورة للمنتج، أو التصدير لا يربطها، أو الصورة خاصة أو محجوبة.',
      fix: [
        'اربط صورة المنتج بـ `image_link` في الملف عنواناً كاملاً بـ `https://`.',
        'افتح العنوان في متصفح دون تسجيل دخول: يجب أن تظهر الصورة.',
      ],
    },
  },
  {
    id: 'gtin',
    match: [/gtin|invalid value \[?gtin|incorrect gtin/i, /رقم التجارة العالمي|باركود.*غير صالح/i],
    tool: 'feed-check',
    en: {
      name: 'GTIN missing or invalid',
      means: 'The product’s barcode number is absent or fails the check.',
      cause: 'A GTIN with the wrong length or last digit, Arabic digits, or a made-up number.',
      fix: [
        'Copy the GTIN from the packaging or the supplier, in digits 0–9.',
        'If the product has none, leave it out and set `identifier_exists` to `no`.',
      ],
    },
    ar: {
      name: 'رقم GTIN مفقود أو غير صالح',
      means: 'رقم باركود المنتج غائب أو لا يجتاز التحقق.',
      cause: 'رقم بطول خطأ أو رقم أخير خطأ، أو بأرقام عربية، أو رقم مختلق.',
      fix: [
        'انسخ الرقم من العبوة أو المورّد بأرقام 0–9.',
        'وإن لم يكن للمنتج رقم فاتركه واجعل `identifier_exists` تساوي `no`.',
      ],
    },
  },
  {
    id: 'landing-page',
    match: [
      /landing page (not working|unavailable)|unavailable landing page|page not found/i,
      /صفحة الهبوط.*(لا تعمل|غير متاحة)|صفحة المنتج.*غير متاحة/i,
    ],
    tool: 'redirect-chain-check',
    en: {
      name: 'Landing page not working or unavailable',
      means: 'The product’s link in the feed leads to an error or a page that does not open.',
      cause:
        'A product deleted from the store but still in the feed, a link with a wrong address, or a redirect to the home page.',
      fix: [
        'Open the product link from the feed yourself.',
        'Remove products that no longer exist from the feed, and keep the link to the product’s own page.',
      ],
    },
    ar: {
      name: 'صفحة الهبوط لا تعمل أو غير متاحة',
      means: 'رابط المنتج في الملف يقود إلى خطأ أو إلى صفحة لا تُفتح.',
      cause: 'منتج حُذف من المتجر وبقي في الملف، أو رابط بعنوان خطأ، أو تحويل إلى الصفحة الرئيسية.',
      fix: [
        'افتح رابط المنتج من الملف بنفسك.',
        'أزل من الملف المنتجات التي لم تعد موجودة، وأبقِ الرابط إلى صفحة المنتج نفسها.',
      ],
    },
  },
  {
    id: 'lcp',
    match: [/lcp issue|largest contentful paint/i, /أكبر عنصر محتوى|مشكلة lcp/i],
    tool: 'core-web-vitals',
    en: {
      name: 'LCP issue: longer than 2.5 s (or 4 s)',
      means: 'The largest element on the page takes too long to show to real visitors.',
      cause: 'A large hero image, a slow server, a font or script that blocks the page.',
      fix: [
        'Make the main image smaller and serve it in a modern format; do not lazy-load the one at the top.',
        'Speed up the server response and remove scripts that block the first paint.',
      ],
    },
    ar: {
      name: 'مشكلة LCP: أطول من 2.5 ثانية (أو 4)',
      means: 'أكبر عنصر في الصفحة يتأخر في الظهور للزوار الحقيقيين.',
      cause: 'صورة رئيسية كبيرة، أو خادم بطيء، أو خط أو سكربت يعطّل الصفحة.',
      fix: [
        'صغّر الصورة الرئيسية وقدّمها بصيغة حديثة، ولا تؤجّل تحميل الصورة التي في الأعلى.',
        'سرّع استجابة الخادم وأزل السكربتات التي تعطل أول رسم.',
      ],
    },
  },
  {
    id: 'cls',
    match: [/cls issue|cumulative layout shift/i, /تغير التخطيط|مشكلة cls/i],
    tool: 'core-web-vitals',
    en: {
      name: 'CLS issue: more than 0.1 (or 0.25)',
      means: 'The page jumps while it loads, for real visitors.',
      cause:
        'Images and ads without a size, a late font that changes the lines, or content inserted above what is being read.',
      fix: [
        'Give images and embeds a width and height.',
        'Reserve the room of banners and late content, and load the page’s fonts early.',
      ],
    },
    ar: {
      name: 'مشكلة CLS: أكثر من 0.1 (أو 0.25)',
      means: 'تقفز الصفحة أثناء تحميلها للزوار الحقيقيين.',
      cause: 'صور وإعلانات بلا مقاس، أو خط متأخر يغيّر الأسطر، أو محتوى يُدرج فوق ما يقرؤه الزائر.',
      fix: [
        'أعطِ الصور والمضمّنات عرضاً وارتفاعاً.',
        'احجز مكان اللافتات والمحتوى المتأخر، وحمّل خطوط الصفحة مبكراً.',
      ],
    },
  },
  {
    id: 'inp',
    match: [/inp issue|interaction to next paint/i, /مشكلة inp|التفاعل مع الرسم/i],
    tool: 'core-web-vitals',
    en: {
      name: 'INP issue: longer than 200 ms (or 500 ms)',
      means: 'The page answers slowly when a visitor taps or clicks.',
      cause:
        'Heavy scripts that keep the browser busy: ad and tracking tags, large frameworks, long tasks.',
      fix: [
        'Remove scripts you do not need, and load the rest late.',
        'Split long tasks, and avoid heavy work when a button is pressed.',
      ],
    },
    ar: {
      name: 'مشكلة INP: أطول من 200 ملّي ثانية (أو 500)',
      means: 'تبطئ الصفحة في الرد حين يضغط الزائر أو ينقر.',
      cause: 'سكربتات ثقيلة تُبقي المتصفح مشغولاً: وسوم الإعلانات والتتبع وأطر كبيرة ومهام طويلة.',
      fix: [
        'احذف السكربتات التي لا تحتاجها وأخّر تحميل الباقي.',
        'قسّم المهام الطويلة وتجنب الأعمال الثقيلة عند ضغط الزر.',
      ],
    },
  },
]

/** Letters in one form, so a pasted Arabic message matches a pattern written plainly. */
export function foldMessage(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The entries whose patterns find the message: the one whose matched patterns say most first (a
 * longer pattern is a more specific one), then in the list's order.
 */
export function decodeError(message: string): readonly ErrorEntry[] {
  const folded = foldMessage(message)
  if (folded === '') return []
  const scored = ERRORS.map((entry, order) => ({
    entry,
    order,
    weight: entry.match
      .filter((pattern) => pattern.test(folded) || pattern.test(message))
      .reduce((sum, pattern) => sum + pattern.source.length, 0),
  })).filter(({ weight }) => weight > 0)
  return scored.sort((a, b) => b.weight - a.weight || a.order - b.order).map(({ entry }) => entry)
}

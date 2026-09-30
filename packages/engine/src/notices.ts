import type { EgressErrorCode } from '@arablyzer/egress'
import type { Notice } from '@arablyzer/report-schema'

export type NoticeCode =
  | EgressErrorCode
  | 'robots-unchecked'
  | 'robots-truncated'
  | 'sitemap-unchecked'
  | 'opted-out'
  | 'page-status'
  | 'bot-challenge'
  | 'not-html'
  | 'little-text'
  | 'page-too-complex'
  | 'page-truncated'
  | 'page-unreadable'
  | 'render-skipped'
  | 'render-engine-skipped'
  | 'render-failed'
  | 'render-challenged'
  | 'render-timeout'
  | 'engine-unavailable'
  | 'engine-refused'
  | 'render-truncated'
  | 'request-limit'
  | 'crux-no-key'
  | 'crux-private'
  | 'crux-not-found'
  | 'crux-failed'
  | 'crux-refused'
  | 'lab-failed'
  | 'lab-timeout'
  | 'lab-unavailable'
  | 'lab-skipped'
  | 'dns-unchecked'
  | 'dns-unavailable'
  | 'links-limit'
  | 'links-limit-more'
  | 'links-robots'
  | 'links-unanswered'
  | 'lab-challenged'

/**
 * User-facing scan notices. They are chosen by code only: egress error details (such as the
 * resolved address of a blocked host) never reach a report (M0.1 security review).
 */
const NOTICES: Readonly<Record<NoticeCode, { readonly ar: string; readonly en: string }>> = {
  'invalid-url': {
    ar: 'الرابط غير صالح؛ يجب أن يبدأ بـ http:// أو https://.',
    en: 'The address is not a valid URL; it must start with http:// or https://.',
  },
  'unsupported-scheme': {
    ar: 'نفحص روابط http وhttps فقط.',
    en: 'Only http and https URLs are scanned.',
  },
  'url-too-long': {
    ar: 'الرابط أطول من 2048 حرفاً.',
    en: 'The URL is longer than 2048 characters.',
  },
  'credentials-in-url': {
    ar: 'لا نفحص روابط فيها اسم مستخدم أو كلمة مرور.',
    en: 'URLs that contain a user name or password are not scanned.',
  },
  'port-not-allowed': {
    ar: 'نفحص المنفذين 80 و443 فقط.',
    en: 'Only ports 80 and 443 are scanned.',
  },
  'blocked-host': {
    ar: 'الرابط، أو تحويل في طريقه، يشير إلى اسم داخلي لا إلى موقع عام، فلم نفحصه.',
    en: 'The URL, or a redirect on the way, points to an internal host name rather than a public website, so it was not scanned.',
  },
  'blocked-address': {
    ar: 'الرابط، أو تحويل في طريقه، يشير إلى شبكة خاصة أو محجوزة، فلم نفحصه.',
    en: 'The URL, or a redirect on the way, points to a private or reserved network, so it was not scanned.',
  },
  'dns-failed': {
    ar: 'تعذّر العثور على النطاق في DNS.',
    en: 'The domain name could not be found in DNS.',
  },
  'connect-failed': {
    ar: 'تعذّر الاتصال بالخادم.',
    en: 'Could not connect to the server.',
  },
  'tls-failed': {
    ar: 'فشل الاتصال الآمن (HTTPS)؛ قد تكون الشهادة غير صالحة.',
    en: 'The secure (HTTPS) connection failed; the certificate may be invalid.',
  },
  timeout: {
    ar: 'انتهت المهلة قبل أن يكتمل التحميل.',
    en: 'The time limit ran out before loading finished.',
  },
  aborted: {
    ar: 'أُلغي الفحص.',
    en: 'The scan was cancelled.',
  },
  'too-many-redirects': {
    ar: 'الرابط يحوّل أكثر من 10 مرات.',
    en: 'The URL redirects more than 10 times.',
  },
  'invalid-redirect': {
    ar: 'الخادم أرسل تحويلاً إلى رابط غير صالح.',
    en: 'The server redirected to an invalid URL.',
  },
  'too-large': {
    ar: 'الصفحة أكبر من 25 ميغابايت.',
    en: 'The page is larger than 25 MB.',
  },
  'decode-failed': {
    ar: 'تعذّر فك ضغط الصفحة.',
    en: 'The page could not be decompressed.',
  },
  'invalid-status': {
    ar: 'ردّ الخادم برمز حالة HTTP غير صالح (ليس بين 100 و599)، فلم نقرأ الصفحة.',
    en: 'The server answered with an invalid HTTP status code (not between 100 and 599), so the page was not read.',
  },
  'robots-unchecked': {
    ar: 'تعذّر فحص robots.txt، فلم تُطبَّق القواعد التي تحتاجه.',
    en: 'robots.txt could not be checked, so the rules that need it did not run.',
  },
  'robots-truncated': {
    ar: 'ملف robots.txt أكبر من 500 كيلوبايت، فقرأنا أول 500 كيلوبايت فقط كما يفعل Google.',
    en: 'robots.txt is larger than 500 KiB, so only the first 500 KiB were read, as Google does.',
  },
  'sitemap-unchecked': {
    ar: 'تعذّرت قراءة بعض خرائط الموقع، فحكمت القواعد التي تفحصها على ما قُرئ منها، ولم تُطبَّق إن لم تُقرأ أي خريطة.',
    en: 'Some of the site’s sitemaps could not be read, so the rules that check them judged the ones that could be, and did not run when none could.',
  },
  // M2.4 plan §2: the site's own words, the rule and where it is, so its owner can find it.
  'opted-out': {
    ar: 'يطلب ملف robots.txt في الموقع ألّا يفحص {bot} هذه الصفحة، فلم نفحصها. القاعدة «{rule}» في السطر {line} من {robots}.',
    en: 'The site’s robots.txt asks {bot} not to check this page, so it was not scanned. The rule “{rule}” is on line {line} of {robots}.',
  },
  'page-status': {
    ar: 'الصفحة ردّت بالحالة HTTP {status}، فلم نفحص محتواها.',
    en: 'The page answered HTTP {status}, so its content was not checked.',
  },
  // BUILD-PLAN §13: a site that blocks the bot says so, honestly; the scan never gets past it.
  'bot-challenge': {
    ar: 'ردّ الموقع بتحدٍّ للبوتات من {service} (HTTP {status}) بدل الصفحة، فلم نفحص محتواها: لا يحاول Arablyzer تجاوز أي تحدٍّ.',
    en: 'The site answered with a {service} bot challenge (HTTP {status}) instead of the page, so its content was not checked: Arablyzer never tries to get past a challenge.',
  },
  'not-html': {
    ar: 'الاستجابة ليست صفحة HTML، ففحصنا ترويساتها فقط.',
    en: 'The response is not an HTML page, so only its headers were checked.',
  },
  'page-too-complex': {
    ar: 'بنية HTML في الصفحة معقّدة جداً فلم تكتمل قراءتها: عدد عناصرها أو عمق تداخلها أكبر مما نقرؤه، أو تجاوزت قراءتها الوقت المحدد، فلم تُطبَّق الفحوص التي تحتاج HTML الصفحة ونصّها.',
    en: 'The page’s HTML is too complex to read: it has more elements, or nests deeper, than a scan reads, or reading it ran past the time limit, so the checks that need its HTML and text did not run.',
  },
  'page-truncated': {
    ar: 'HTML الصفحة أكبر من 15 ميغابايت، فقرأنا أول 15 ميغابايت فقط كما يفعل Google.',
    en: 'The page’s HTML is larger than 15 MB, so only the first 15 MB were read, as Google does.',
  },
  'page-unreadable': {
    ar: 'تعذّرت قراءة محتوى الصفحة بسبب خطأ داخلي في Arablyzer، فلم نفحصها.',
    en: 'Arablyzer could not read the page’s content because of an internal error, so the page was not checked.',
  },
  'little-text': {
    ar: 'في HTML الصفحة نص قليل جداً مع سكربتات، فالأرجح أن JavaScript يبني محتواها. فحوص النص تقرأ HTML الخام، فقد تظهر «غير منطبقة»؛ أما فحوص العرض فترى الصفحة بعد تشغيل JavaScript.',
    en: 'The page’s HTML has almost no text but loads scripts, so JavaScript probably builds its content. Text checks read the raw HTML, so they may show as not applicable; rendering checks see the page after JavaScript runs.',
  },
  'render-skipped': {
    ar: 'بعض الفحوص تحتاج عرض الصفحة في متصفح، ولم يُطلب العرض في هذا الفحص، فلم تعمل.',
    en: 'Some checks need the page rendered in a browser; this scan did not render it, so they did not run.',
  },
  'render-engine-skipped': {
    ar: 'بعض الفحوص تقرأ ما يخبر به {engines} وحده، ولم يُعرض هذا الفحص فيه، فلم تعمل.',
    en: 'Some checks read what only {engines} reports, and this scan did not render in it, so they did not run.',
  },
  'render-failed': {
    ar: 'تعذّر عرض الصفحة في {engine}، فلم تعمل فيه فحوص العرض.',
    en: 'The page could not be rendered in {engine}, so the rendering checks did not run in it.',
  },
  // BUILD-PLAN §13: the browser is given the page only once its headers are checked (M2.3c).
  'render-challenged': {
    ar: 'ردّ الموقع في {engine} بتحدٍّ للبوتات من {service} (HTTP {status}) بدل الصفحة، فلم تُعرض الصفحة فيه: لا يحاول Arablyzer تجاوز أي تحدٍّ.',
    en: 'In {engine}, the site answered with a {service} bot challenge (HTTP {status}) instead of the page, so the page was not rendered there: Arablyzer never tries to get past a challenge.',
  },
  'render-timeout': {
    ar: 'لم يكتمل عرض الصفحة في {engine} خلال الوقت المحدد، فلم تعمل فيه فحوص العرض.',
    en: 'Rendering the page in {engine} did not finish within the time limit, so the rendering checks did not run in it.',
  },
  'engine-unavailable': {
    ar: 'المتصفح {engine} غير مثبّت على هذا الجهاز، فلم تُعرض الصفحة فيه.',
    en: '{engine} is not installed on this machine, so the page was not rendered in it.',
  },
  'engine-refused': {
    ar: 'المتصفح {engine} يرسل بعض اتصالاته دون المرور بالبروكسي الذي يفحص كل طلب، فلا يعمل إلا داخل حاوية شبكتها معزولة، ولم تُعرض الصفحة فيه.',
    en: '{engine} sends some of its traffic around the proxy that checks every request, so it runs only in a container with an isolated network; the page was not rendered in it.',
  },
  'render-truncated': {
    ar: 'الصفحة كبيرة، فقِسنا في {engine} جزءاً منها فقط ضمن حدود الوقت وعدد العناصر.',
    en: 'The page is large, so in {engine} only part of it was measured, within the time and element limits.',
  },
  'request-limit': {
    ar: 'طلبت الصفحة في {engine} أكثر من الحد (300 طلب أو 25 ميغابايت)، فلم يُحمَّل الباقي، وقد يختلف عرضها عمّا يراه الزائر.',
    en: 'In {engine}, the page asked for more than the limit (300 requests or 25 MB), so the rest was not loaded, and it may look different from what visitors see.',
  },
  'crux-no-key': {
    ar: 'فحوص سرعة الزوار الحقيقيين تقرأ بيانات Google (CrUX)، وتحتاج مفتاحاً لم يُعطَ لهذا الفحص، فلم تعمل.',
    en: "The checks of real visitors' speed read Google's data (CrUX), which needs a key this scan was not given, so they did not run.",
  },
  'crux-private': {
    ar: 'الصفحة على عنوان محلي أو خاص، فلم نسأل Google (CrUX) عن سرعة زوارها.',
    en: "The page is on a local or private address, so Google (CrUX) was not asked about its visitors' speed.",
  },
  'crux-not-found': {
    ar: 'ليس عند Google (CrUX) بيانات عن زوار هذه الصفحة ولا موقعها، وهذا حال كثير من المواقع قليلة الزيارات، فلا تنطبق فحوص سرعة الزوار الحقيقيين.',
    en: "Google (CrUX) has no data on visitors to this page or its site, as for many sites with fewer visits, so the checks of real visitors' speed do not apply.",
  },
  'lab-failed': {
    ar: 'تعذّر قياس الصفحة بـ Lighthouse، فليس في التقرير قياساته.',
    en: 'Lighthouse could not measure the page, so the report has no lab metrics.',
  },
  'lab-timeout': {
    ar: 'لم ينتهِ Lighthouse من قياس الصفحة في وقته، أو لم تكتمل الصفحة حين توقف عن انتظارها، فليس في التقرير قياساته.',
    en: 'Lighthouse did not finish measuring the page in time, or the page had not finished loading when it stopped waiting, so the report has no lab metrics.',
  },
  'lab-unavailable': {
    ar: 'Lighthouse أو متصفح Chromium غير مثبّت على هذا الجهاز، فلم يعمل Lighthouse.',
    en: 'Lighthouse or Chromium is not installed on this machine, so Lighthouse did not run.',
  },
  'lab-challenged': {
    ar: 'ردّ الموقع على متصفح بتحدٍّ للبوتات بدل الصفحة، فلم يفتحها Lighthouse: لا يحاول Arablyzer تجاوز أي تحدٍّ.',
    en: 'A browser was answered with a bot challenge instead of the page, so Lighthouse did not open it: Arablyzer never tries to get past a challenge.',
  },
  'lab-skipped': {
    ar: 'لم يبقَ من وقت الفحص ما يكفي Lighthouse، فلم يعمل.',
    en: 'The scan had no time left for Lighthouse, so it did not run.',
  },
  'crux-refused': {
    ar: 'رفضت Google (CrUX) الطلب، وأكثر ما يكون ذلك لمفتاح API غير صالح أو غير مفعّل لـ Chrome UX Report API، فلم تعمل فحوص سرعة الزوار الحقيقيين.',
    en: "Google (CrUX) refused the request, most often for an API key that is not valid or not enabled for the Chrome UX Report API, so the checks of real visitors' speed could not run.",
  },
  'crux-failed': {
    ar: 'تعذّر جلب بيانات الزوار الحقيقيين من Google (CrUX)، فلم تعمل فحوصها.',
    en: "Real visitors' data could not be fetched from Google (CrUX), so its checks could not run.",
  },
  // M2.3c: a lookup that got no answer says nothing of the records, so its rules do not judge.
  'dns-unchecked': {
    ar: 'تعذّرت قراءة سجلات DNS للنطاق {domain}: لم يصل جواب في الوقت المحدد، أو ردّ خادم DNS بخطأ، فلم تعمل الفحوص التي تقرؤها.',
    en: 'The DNS records of {domain} could not be read: no answer came in time, or the DNS server answered with an error, so the checks that read them did not run.',
  },
  // M2.3c: the page's links to its own site that were not checked, none of them counted broken.
  'links-limit': {
    ar: 'في الصفحة روابط إلى موقعها عددها {total}، ففحصنا أول {limit} منها، ولم نفحص الباقي وعدده {count}.',
    en: 'The page links to {total} addresses on its own site: the scan checked the first {limit}, and not the other {count}.',
  },
  'links-limit-more': {
    ar: 'في الصفحة روابط إلى موقعها عددها {total} على الأقل، ففحصنا أول {limit} منها، ولم نفحص الباقي وعدده {count} على الأقل.',
    en: 'The page links to at least {total} addresses on its own site: the scan checked the first {limit}, and not the other {count} or more.',
  },
  'links-robots': {
    ar: 'روابط في الصفحة عددها {count} تقود إلى مسارات يطلب ملف robots.txt في الموقع ألّا يجلبها {bot} أو الزواحف عامةً (User-agent: *)، فلم نفحصها. فالصفحة نفسها زيارة طلبها شخص، أما روابطها فنطلبها كما يطلبها زاحف، فتسري عليها مجموعة * أيضاً، إلا أن تسمّي المجموعة {bot} فتحلّ محلها.',
    en: '{count} of the page’s links lead to paths the site’s robots.txt asks {bot}, or crawlers in general (User-agent: *), not to fetch, so they were not checked. The page itself is a visit someone asked for, but its links are requested as a crawler would, so the * group applies to them too, unless a group names {bot}, which replaces it.',
  },
  'links-unanswered': {
    ar: 'روابط في الصفحة إلى موقعها عددها {count} لم نستطع الحكم عليها: لم يصل جوابها في الوقت المحدد، أو تعذّر الاتصال، أو رفض الموقع الطلب بإحدى الحالات 401 و403 و407 و429 و503 التي يردّ بها الموقع على زائر يظنه بوتاً أو يطلب تسجيل الدخول أو يعجز عن الخدمة، وبعد أول 429 لا نطلب رابطاً آخر.',
    en: '{count} of the page’s links to its own site could not be judged: no answer came in time, the connection failed, or the site refused the request with a 401, 403, 407, 429 or 503, as a site answers a visitor it takes for a bot, that must sign in, or that it cannot serve just now. After the first 429 the scan asks for no more links.',
  },
  'dns-unavailable': {
    ar: 'لا يملك هذا الفحص طريقة لسؤال DNS عن السجلات، فلم تعمل الفحوص التي تقرأ سجلات DNS للنطاق.',
    en: 'This scan has no way to look up DNS records, so the checks that read the domain’s DNS records did not run.',
  },
}

export function notice(code: NoticeCode, values: Readonly<Record<string, string>> = {}): Notice {
  const fill = (text: string) =>
    text.replace(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? '')
  const { ar, en } = NOTICES[code]
  return { code, message: { ar: fill(ar), en: fill(en) } }
}

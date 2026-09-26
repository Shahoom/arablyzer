import type { EgressErrorCode } from '@arablyzer/egress'
import type { Notice } from '@arablyzer/report-schema'

export type NoticeCode =
  | EgressErrorCode
  | 'robots-unchecked'
  | 'robots-truncated'
  | 'page-status'
  | 'not-html'
  | 'little-text'
  | 'page-too-complex'
  | 'page-truncated'
  | 'page-unreadable'
  | 'render-skipped'
  | 'render-engine-skipped'
  | 'render-failed'
  | 'render-timeout'
  | 'engine-unavailable'
  | 'engine-refused'
  | 'render-truncated'
  | 'request-limit'

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
  'page-status': {
    ar: 'الصفحة ردّت بالحالة HTTP {status}، فلم نفحص محتواها.',
    en: 'The page answered HTTP {status}, so its content was not checked.',
  },
  'not-html': {
    ar: 'الاستجابة ليست صفحة HTML، ففحصنا ترويساتها فقط.',
    en: 'The response is not an HTML page, so only its headers were checked.',
  },
  'page-too-complex': {
    ar: 'بنية HTML في الصفحة معقّدة جداً فلم تكتمل قراءتها في الوقت المحدد، فلم تُطبَّق الفحوص التي تحتاج HTML الصفحة ونصّها.',
    en: 'The page’s HTML is too complex to read within the time limit, so the checks that need its HTML and text did not run.',
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
}

export function notice(code: NoticeCode, values: Readonly<Record<string, string>> = {}): Notice {
  const fill = (text: string) =>
    text.replace(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? '')
  const { ar, en } = NOTICES[code]
  return { code, message: { ar: fill(ar), en: fill(en) } }
}

import type { EgressErrorCode } from '@arablyzer/egress'
import type { Notice } from '@arablyzer/report-schema'

export type NoticeCode =
  | EgressErrorCode
  | 'robots-unchecked'
  | 'robots-truncated'
  | 'page-status'
  | 'not-html'
  | 'little-text'

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
  'little-text': {
    ar: 'في HTML الصفحة نص قليل جداً مع سكربتات، فالأرجح أن JavaScript يبني محتواها. هذا الإصدار يقرأ HTML الخام فقط، فقد تظهر فحوص النص «غير منطبقة».',
    en: 'The page’s HTML has almost no text but loads scripts, so JavaScript probably builds its content. This version reads the raw HTML only, so text checks may show as not applicable.',
  },
}

export function notice(code: NoticeCode, values: Readonly<Record<string, string>> = {}): Notice {
  const fill = (text: string) =>
    text.replace(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? '')
  const { ar, en } = NOTICES[code]
  return { code, message: { ar: fill(ar), en: fill(en) } }
}

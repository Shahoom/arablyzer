import { MAX_URL_LENGTH, type ScanErrorCode } from '@arablyzer/api-contract/codes'
import type { Copy } from './copy'
import { arabicCount, englishCount, MINUTES_GENITIVE } from './plural'

/** Problems the form finds before it sends anything. */
export type FormProblem = 'empty' | 'network'

export interface ScanFormStrings {
  readonly label: string
  readonly placeholder: string
  readonly submit: string
  readonly submitting: string
  /** Shown when the page runs without JavaScript: Turnstile needs it. */
  readonly noscript: string
  readonly errors: Readonly<Record<ScanErrorCode | FormProblem, string>>
  /** After rate-limited: when the visitor may scan again. */
  readonly retryAfter: (seconds: number) => string
}

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60))

export const SCAN_FORM: Copy<ScanFormStrings> = {
  reviewed: false,
  ar: {
    label: 'رابط الصفحة',
    placeholder: 'https://example.com',
    submit: 'افحص الصفحة',
    submitting: 'نبدأ الفحص…',
    noscript: 'الفحص يحتاج JavaScript: فعّله في متصفحك ثم أعد المحاولة.',
    errors: {
      empty: 'اكتب رابط الصفحة أولاً.',
      network: 'لم نصل إلى خدمة الفحص. تأكد من اتصالك وأعد المحاولة.',
      'invalid-url': 'هذا ليس رابطاً كاملاً. اكتبه ببدايته، مثل https://example.com',
      'unsupported-scheme': 'نفحص روابط http وhttps وحدها.',
      'url-too-long': `الرابط أطول من ${MAX_URL_LENGTH} حرفاً، فلا نفحصه.`,
      'credentials-in-url': 'لا نفحص روابط فيها اسم مستخدم أو كلمة مرور.',
      'port-not-allowed': 'نفحص المواقع على منفذيها المعتادين وحدهما، 80 و443.',
      'blocked-host': 'هذا اسم داخلي لا يصل إليه الناس من الإنترنت، فلا نفحصه.',
      'blocked-address': 'هذا عنوان داخلي أو خاص، ونحن نفحص المواقع العامة وحدها.',
      'dns-failed': 'لم نجد هذا النطاق. تأكد من كتابته.',
      'turnstile-failed': 'لم نتمكن من التحقق من أن الطلب من إنسان. أعد المحاولة.',
      'rate-limited': 'وصلت إلى حد الفحوص المجانية الآن.',
      unavailable: 'خدمة الفحص غير متاحة الآن. جرّب بعد قليل.',
    },
    retryAfter: (seconds) => `جرّب بعد ${arabicCount(minutes(seconds), MINUTES_GENITIVE)}.`,
  },
  en: {
    label: 'Page URL',
    placeholder: 'https://example.com',
    submit: 'Check page',
    submitting: 'Starting the scan…',
    noscript: 'The scan needs JavaScript: turn it on in your browser and try again.',
    errors: {
      empty: 'Enter the page URL first.',
      network: 'We could not reach the scan service. Check your connection and try again.',
      'invalid-url': 'That is not a full URL. Include its start, as in https://example.com',
      'unsupported-scheme': 'We scan http and https URLs only.',
      'url-too-long': `The URL is longer than ${MAX_URL_LENGTH} characters, so we do not scan it.`,
      'credentials-in-url': 'We do not scan URLs that contain a user name or password.',
      'port-not-allowed': 'We scan sites on their usual ports only, 80 and 443.',
      'blocked-host':
        'That is an internal name nobody on the internet can reach, so we do not scan it.',
      'blocked-address': 'That address is internal or private; we scan public sites only.',
      'dns-failed': 'We could not find that domain. Check how it is spelled.',
      'turnstile-failed': 'We could not confirm that a person sent this. Try again.',
      'rate-limited': 'You have reached the limit of free scans for now.',
      unavailable: 'The scan service is not available right now. Try again shortly.',
    },
    retryAfter: (seconds) => `Try again in ${englishCount(minutes(seconds), 'minute', 'minutes')}.`,
  },
}

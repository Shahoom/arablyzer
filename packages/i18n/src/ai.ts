import type { AiConfidence, AiErrorCode } from '@arablyzer/api-contract/codes'
import type { Copy } from './copy'

/** Why a suggestion was not shown: what the API said, or that it could not be asked. */
export type AiProblem = AiErrorCode | 'network'

/** The words of the fix assistant on a report (BUILD-PLAN §12). The numbers come from the API, not from here. */
export interface AiStrings {
  readonly button: string
  /** The button's name for a screen reader: which rule it is for. */
  readonly buttonLabel: (rule: string) => string
  readonly working: string
  readonly title: string
  /** Said with every suggestion: it is the model's, and only a suggestion. */
  readonly generated: string
  readonly steps: string
  readonly patch: string
  readonly confidenceLabel: string
  readonly confidence: Readonly<Record<AiConfidence, string>>
  readonly copy: string
  readonly copied: string
  /** «2 of 5 suggestions used in the last day» */
  readonly left: (used: number, perDay: number) => string
  readonly problems: Readonly<Record<AiProblem, string>>
}

export const AI_UI: Copy<AiStrings> = {
  reviewed: false,
  ar: {
    button: 'اقترح إصلاحاً بالذكاء الاصطناعي',
    buttonLabel: (rule) => `اقترح إصلاحاً بالذكاء الاصطناعي للقاعدة ${rule}`,
    working: 'نجهّز الاقتراح…',
    title: 'إصلاح مقترح',
    generated: 'مولّد بالذكاء الاصطناعي. راجعه قبل أن تطبّقه.',
    steps: 'الخطوات',
    patch: 'التعديل المقترح',
    confidenceLabel: 'درجة الثقة',
    confidence: { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' },
    copy: 'انسخ',
    copied: 'تم النسخ',
    left: (used, perDay) => `استخدمت ${String(used)} من ${String(perDay)} اقتراحات في آخر يوم`,
    problems: {
      'bad-request': 'تعذّر إرسال الطلب. أعد تحميل الصفحة وحاول مرة أخرى.',
      unauthorized: 'سجّل الدخول لتطلب اقتراح إصلاح.',
      'not-found': 'لا يوجد في هذا التقرير ما يمكن اقتراح إصلاحه لهذه القاعدة.',
      'plan-limit': 'خطتك لا تتضمن اقتراح الإصلاحات بالذكاء الاصطناعي.',
      'rate-limited': 'وصلت إلى حدّ الاقتراحات في اليوم. حاول لاحقاً.',
      budget: 'المساعد متوقف مؤقتاً لأن حدّ إنفاقه قد بلغ نهايته. حاول لاحقاً.',
      refused: 'امتنع النموذج عن الإجابة عن هذه المشكلة.',
      unavailable: 'المساعد غير متاح الآن. حاول بعد قليل.',
      failed: 'لم نحصل على اقتراح صالح. حاول مرة أخرى.',
      network: 'تعذّر الاتصال. تحقق من الشبكة وحاول مرة أخرى.',
    },
  },
  en: {
    button: 'Suggest a fix with AI',
    buttonLabel: (rule) => `Suggest a fix with AI for the rule ${rule}`,
    working: 'Preparing a suggestion…',
    title: 'Suggested fix',
    generated: 'AI-generated. Review it before you apply it.',
    steps: 'Steps',
    patch: 'Suggested change',
    confidenceLabel: 'Confidence',
    confidence: { high: 'High', medium: 'Medium', low: 'Low' },
    copy: 'Copy',
    copied: 'Copied',
    left: (used, perDay) => `${String(used)} of ${String(perDay)} suggestions used in the last day`,
    problems: {
      'bad-request': 'The request could not be sent. Reload the page and try again.',
      unauthorized: 'Sign in to ask for a suggested fix.',
      'not-found': 'This report has nothing to suggest a fix for under this rule.',
      'plan-limit': 'Your plan does not include AI-suggested fixes.',
      'rate-limited': 'You have used the suggestions your plan gives for the day. Try again later.',
      budget:
        'The assistant is paused because its spending limit has been reached. Try again later.',
      refused: 'The model declined to answer about this problem.',
      unavailable: 'The assistant is not available now. Try again in a moment.',
      failed: 'We did not get a usable suggestion. Try again.',
      network: 'Could not connect. Check your network and try again.',
    },
  },
}

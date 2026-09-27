import type { RuleStatus, ScanStatus, Severity } from '@arablyzer/report-schema'
import type { Lang } from './site'

export interface PageStrings {
  /** BUILD-PLAN §1: «Arablyzer — محلّل المواقع العربية». */
  readonly tagline: string
  readonly home: string
  readonly tools: string
  readonly breadcrumb: string
  readonly urlLabel: string
  readonly check: string
  readonly sections: Readonly<
    Record<'checks' | 'example' | 'fix' | 'faq' | 'links' | 'about', string>
  >
  readonly wrong: string
  readonly right: string
  readonly rules: string
  readonly otherTools: string
  readonly updated: string
  /** The link to the page in the other language, written in that language. */
  readonly otherLang: string
  readonly report: {
    readonly title: string
    readonly scannedPage: string
    readonly summary: string
    readonly findings: string
    readonly noFindings: string
    readonly ruleErrors: string
    readonly notices: string
    readonly line: string
    /** As the CLI says it. */
    readonly score: (value: number, partial: boolean) => string
    readonly scan: Readonly<Record<ScanStatus, string>>
    readonly status: Readonly<Record<RuleStatus, string>>
    readonly severity: Readonly<Record<Severity, string>>
  }
}

/** Page labels. The report words match the CLI's (packages/cli/src/i18n.ts). */
export const STRINGS: Readonly<Record<Lang, PageStrings>> = {
  ar: {
    tagline: 'محلّل المواقع العربية',
    home: 'الرئيسية',
    tools: 'الأدوات',
    breadcrumb: 'مسار التنقل',
    urlLabel: 'رابط الصفحة',
    check: 'افحص',
    sections: {
      checks: 'ماذا تفحص هذه الأداة',
      example: 'مثال',
      fix: 'كيف تُصلح',
      faq: 'أسئلة شائعة',
      links: 'روابط ذات صلة',
      about: 'المنهجية',
    },
    wrong: 'خطأ',
    right: 'صحيح',
    rules: 'القواعد التي تطبّقها الأداة',
    otherTools: 'أدوات أخرى',
    updated: 'آخر تحديث:',
    otherLang: 'English',
    report: {
      title: 'تقرير Arablyzer',
      scannedPage: 'الصفحة المفحوصة:',
      summary: 'الملخص',
      score: (value, partial) =>
        `الدرجة ${value} من 100${partial ? ' (جزئية: تعذّر تشغيل بعض القواعد)' : ''}`,
      findings: 'المشكلات',
      noFindings: 'لم تجد القواعد أي مشكلة.',
      ruleErrors: 'قواعد تعذّر تشغيلها',
      notices: 'تنبيهات',
      line: 'السطر',
      scan: { complete: 'مكتمل', partial: 'جزئي', failed: 'فشل' },
      status: {
        pass: 'نجحت',
        fail: 'فشلت',
        'needs-review': 'تحتاج مراجعة',
        'not-applicable': 'لا تنطبق',
        error: 'تعذّر تشغيلها',
      },
      severity: {
        critical: 'حرِج',
        serious: 'خطير',
        moderate: 'متوسط',
        minor: 'بسيط',
        info: 'معلومة',
      },
    },
  },
  en: {
    tagline: 'Arabic website analyzer',
    home: 'Home',
    tools: 'Tools',
    breadcrumb: 'Breadcrumb',
    urlLabel: 'Page URL',
    check: 'Check',
    sections: {
      checks: 'What this tool checks',
      example: 'Example',
      fix: 'How to fix',
      faq: 'FAQ',
      links: 'Related',
      about: 'Methodology',
    },
    wrong: 'Wrong',
    right: 'Right',
    rules: 'Rules this tool applies',
    otherTools: 'Other tools',
    updated: 'Last updated:',
    otherLang: 'العربية',
    report: {
      title: 'Arablyzer report',
      scannedPage: 'Scanned page:',
      summary: 'Summary',
      score: (value, partial) =>
        `Score ${value}/100${partial ? ' (partial: some rules could not run)' : ''}`,
      findings: 'Problems',
      noFindings: 'The rules found no problems.',
      ruleErrors: 'Rules that could not run',
      notices: 'Notices',
      line: 'line',
      scan: { complete: 'complete', partial: 'partial', failed: 'failed' },
      status: {
        pass: 'passed',
        fail: 'failed',
        'needs-review': 'need review',
        'not-applicable': 'not applicable',
        error: 'could not run',
      },
      severity: {
        critical: 'critical',
        serious: 'serious',
        moderate: 'moderate',
        minor: 'minor',
        info: 'info',
      },
    },
  },
}

export function otherLang(lang: Lang): Lang {
  return lang === 'ar' ? 'en' : 'ar'
}

export function dirOf(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr'
}

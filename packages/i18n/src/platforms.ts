import type { Copy } from './copy'

/**
 * The words of the merchant panel of the Salla and Zid apps (M9, issue #41): the page a store's
 * dashboard opens inside itself, and the two small pages an install ends on. The numbers, the
 * dates and the addresses come from the audit, never from here. Arabic is the original.
 */
export interface PlatformStrings {
  readonly panelTitle: string
  readonly storeLabel: string
  readonly scoreLabel: string
  readonly outOf: string
  readonly auditedAt: string
  readonly findingsHeading: string
  readonly severities: {
    readonly critical: string
    readonly serious: string
    readonly moderate: string
    readonly minor: string
  }
  readonly categoriesHeading: string
  readonly openReport: string
  readonly reportNote: string
  readonly running: string
  readonly none: string
  readonly failed: string
  readonly reauth: string
  readonly notInstalled: string
  readonly expired: string
  readonly unavailable: string
  readonly privacy: string
  readonly installedTitle: string
  readonly installedBody: string
  readonly installFailedTitle: string
  readonly installFailedBody: string
  readonly openDashboard: string
}

export const PLATFORM_UI: Copy<PlatformStrings> = {
  reviewed: false,
  ar: {
    panelTitle: 'تقرير متجرك',
    storeLabel: 'المتجر',
    scoreLabel: 'الدرجة العامة',
    outOf: 'من',
    auditedAt: 'آخر فحص',
    findingsHeading: 'ما وجدناه في المتجر',
    severities: { critical: 'حرجة', serious: 'عالية', moderate: 'متوسطة', minor: 'بسيطة' },
    categoriesHeading: 'الدرجة في كل جانب',
    openReport: 'افتح التقرير الكامل',
    reportNote: 'يفتح التقرير في صفحة Arablyzer، وفيه كل مشكلة وكيف تُصلحها.',
    running: 'نفحص متجرك الآن. افتح هذه الصفحة بعد دقائق لترى النتيجة.',
    none: 'لم نفحص متجرك بعد. سيبدأ الفحص قريباً، وتظهر النتيجة هنا.',
    failed: 'تعذّر فحص المتجر هذه المرة. قد يكون متوقفاً مؤقتاً، وسنحاول من جديد.',
    reauth: 'انتهى ربط التطبيق بمنصتك. أعد تفعيل التطبيق من لوحة المتجر ليُحدَّث التقرير باستمرار.',
    notInstalled: 'هذا المتجر غير مرتبط بالتطبيق. ثبّت التطبيق من متجر التطبيقات ثم افتحه من جديد.',
    expired: 'انتهت جلسة فتح الصفحة. أغلق التطبيق وافتحه من جديد.',
    unavailable: 'الخدمة غير متاحة الآن. حاول بعد قليل.',
    privacy:
      'نقرأ صفحات متجرك المعروضة للعموم فقط، ولا نحتفظ ببيانات زبائنك. عند حذف التطبيق نحذف الربط والتقارير.',
    installedTitle: 'تم ربط متجرك',
    installedBody: 'بدأنا فحص متجرك. افتح التطبيق من لوحة المتجر لترى التقرير حين يجهز.',
    installFailedTitle: 'تعذّر إكمال الربط',
    installFailedBody: 'لم يكتمل الربط مع المنصة. ارجع إلى لوحة المتجر وفعّل التطبيق من جديد.',
    openDashboard: 'العودة إلى لوحة المتجر',
  },
  en: {
    panelTitle: 'Your store report',
    storeLabel: 'Store',
    scoreLabel: 'Overall score',
    outOf: 'out of',
    auditedAt: 'Last audit',
    findingsHeading: 'What we found in your store',
    severities: { critical: 'Critical', serious: 'Serious', moderate: 'Moderate', minor: 'Minor' },
    categoriesHeading: 'Score by area',
    openReport: 'Open the full report',
    reportNote: 'Opens the report on Arablyzer, with every problem and how to fix it.',
    running: 'We are auditing your store now. Open this page again in a few minutes.',
    none: 'We have not audited your store yet. The audit starts soon and the result appears here.',
    failed:
      'We could not audit the store this time. It may be down for a moment; we will try again.',
    reauth:
      'The app’s connection to your platform has ended. Activate the app again from your store dashboard so the report keeps updating.',
    notInstalled:
      'This store is not connected to the app. Install the app from the app store and open it again.',
    expired: 'The session that opened this page has expired. Close the app and open it again.',
    unavailable: 'The service is not available right now. Try again shortly.',
    privacy:
      'We read only the pages of your store that are public, and keep no data about your customers. When you uninstall the app we delete the connection and the reports.',
    installedTitle: 'Your store is connected',
    installedBody:
      'We have started auditing your store. Open the app from your store dashboard to see the report when it is ready.',
    installFailedTitle: 'We could not finish connecting',
    installFailedBody:
      'The connection with the platform did not complete. Go back to your store dashboard and activate the app again.',
    openDashboard: 'Back to your store dashboard',
  },
}

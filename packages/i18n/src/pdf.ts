import type { PdfError, PdfKind, TemplateKind } from '@arablyzer/api-contract/codes'
import type { Copy } from './copy'
import { arabicCount, englishCount } from './plural'

/** The words of the PDF export and the white-label settings (M4.7): the document itself, and the page's buttons and form. */
export type SeverityKey = 'critical' | 'serious' | 'moderate' | 'minor' | 'info'
export type LogoProblemKey = 'too-large' | 'type' | 'dimensions' | 'corrupt' | 'unavailable'

export interface PdfStrings {
  /** The document the PDF draws. */
  readonly doc: {
    readonly mark: string
    readonly creditBy: string
    readonly of: string
    /** The line at the foot of every page: who made it, and when. */
    readonly footer: (who: string, date: string) => string
    readonly kicker: Readonly<Record<PdfKind, string>>
    readonly facts: {
      readonly page: string
      readonly site: string
      readonly scanned: string
      readonly made: string
      readonly browsers: string
      readonly noBrowsers: string
      readonly found: string
      readonly checked: string
      readonly templates: string
      readonly from: string
      readonly to: string
    }
    readonly overall: string
    readonly noScore: string
    readonly scoreNote: (ran: number, total: number) => string
    readonly crawlScoreNote: string
    readonly severity: Readonly<Record<SeverityKey, string>>
    readonly sections: {
      readonly summary: string
      readonly categories: string
      readonly severity: (label: string, count: number) => string
      readonly xray: string
      readonly notes: string
      readonly templates: string
      readonly engines: string
      readonly changes: Readonly<Record<'new' | 'worsened' | 'fixed' | 'improved', string>>
    }
    readonly stats: {
      readonly passed: string
      readonly failed: string
      readonly review: string
      readonly critical: string
      readonly found: string
      readonly checked: string
      readonly templates: string
      readonly issues: string
      readonly new: string
      readonly worsened: string
      readonly fixed: string
      readonly improved: string
      readonly unchanged: string
    }
    readonly partial: string
    readonly failedScan: string
    readonly noFindings: string
    readonly needsReview: string
    readonly howToFix: string
    readonly moreFindings: (n: number) => string
    readonly moreIssues: (n: number) => string
    readonly category: string
    readonly score: string
    readonly before: string
    readonly after: string
    readonly change: string
    readonly browser: string
    readonly status: Readonly<
      Record<'rendered' | 'failed' | 'timeout' | 'unavailable' | 'refused', string>
    >
    readonly findings: string
    readonly xrayLead: (percent: number) => string
    readonly xrayEngine: (engine: string, total: number, broken: number) => string
    readonly xrayWords: (words: string) => string
    readonly xrayAlt: (engine: string) => string
    readonly template: string
    readonly kinds: Readonly<Record<TemplateKind, string>>
    readonly pagesFound: string
    readonly pagesChecked: string
    readonly browserScore: string
    readonly topIssues: string
    readonly affected: (pages: number, checked: number) => string
    readonly pagesOf: (pages: number) => string
    readonly renderedTag: string
    readonly example: string
    readonly sameRulesNote: string
    readonly differentRulesNote: string
    readonly omitted: (n: number) => string
    readonly share: (before: string, after: string) => string
    readonly absent: string
  }
  /** The page: the Download PDF button, the list, the white-label form. */
  readonly ui: {
    readonly button: string
    readonly buttonLabel: (what: string) => string
    readonly preparing: string
    readonly ready: string
    readonly download: string
    readonly again: string
    readonly keptNote: (days: number) => string
    readonly allowance: (used: number, perMonth: number) => string
    readonly failed: Readonly<Record<PdfError, string>>
    readonly problems: Readonly<
      Record<
        | 'network'
        | 'unavailable'
        | 'unauthorized'
        | 'not-found'
        | 'conflict'
        | 'plan-limit'
        | 'bad-request'
        | 'rate-limited',
        string
      >
    >
    readonly listTitle: string
    readonly listLead: string
    readonly listEmpty: string
    readonly kinds: Readonly<Record<PdfKind, string>>
    readonly expired: string
    readonly size: (kb: number) => string
    readonly brand: {
      readonly title: string
      readonly lead: string
      readonly notIncluded: string
      readonly name: string
      readonly nameHint: string
      readonly color: string
      readonly colorHint: string
      readonly colorFallback: string
      readonly noColor: string
      readonly logo: string
      readonly logoHint: string
      readonly logoChoose: string
      readonly logoRemove: string
      readonly logoNone: string
      readonly logoProblems: Readonly<Record<LogoProblemKey, string>>
      readonly save: string
      readonly saving: string
      readonly saved: string
      readonly loading: string
      readonly failed: string
      readonly preview: string
      readonly previewEmpty: string
      readonly credit: string
      readonly logoAlt: (name: string) => string
    }
  }
}

const PAGES_AR = { one: 'صفحة واحدة', two: 'صفحتان', few: '{n} صفحات', many: '{n} صفحة' }
const DAYS_AR = { one: 'يوماً واحداً', two: 'يومين', few: '{n} أيام', many: '{n} يوماً' }

export const PDF_UI: Copy<PdfStrings> = {
  reviewed: false,
  ar: {
    doc: {
      mark: 'Arablyzer',
      creditBy: 'بواسطة Arablyzer',
      of: 'من',
      footer: (who, date) => `${who} · ${date}`,
      kicker: {
        scan: 'تقرير فحص صفحة',
        crawl: 'تقرير زحف الموقع',
        'compare-scans': 'مقارنة بين فحصين',
        'compare-crawls': 'مقارنة بين زحفين',
      },
      facts: {
        page: 'الصفحة',
        site: 'الموقع',
        scanned: 'تاريخ الفحص',
        made: 'تاريخ التقرير',
        browsers: 'المتصفحات',
        noBrowsers: 'بلا متصفح',
        found: 'صفحات وُجدت',
        checked: 'صفحات فُحصت',
        templates: 'قوالب',
        from: 'من تقرير',
        to: 'إلى تقرير',
      },
      overall: 'الدرجة العامة',
      noScore: 'لا درجة',
      scoreNote: (ran, total) => `من ${String(ran)} قاعدة شغّلناها من أصل ${String(total)}`,
      crawlScoreNote: 'متوسط درجات الصفحات الممثِّلة في المتصفحات',
      severity: {
        critical: 'حرِج',
        serious: 'خطير',
        moderate: 'متوسط',
        minor: 'بسيط',
        info: 'معلومة',
      },
      sections: {
        summary: 'الملخص',
        categories: 'الدرجة في كل فئة',
        severity: (label, count) => `${label} (${String(count)})`,
        xray: 'أشعة الحروف العربية',
        notes: 'ملاحظات الفحص',
        templates: 'القوالب',
        engines: 'المتصفحات',
        changes: {
          new: 'مشكلات ظهرت',
          worsened: 'مشكلات ساءت',
          fixed: 'مشكلات أُصلحت',
          improved: 'مشكلات تحسّنت',
        },
      },
      stats: {
        passed: 'قواعد نجحت',
        failed: 'قواعد فشلت',
        review: 'تحتاج مراجعة',
        critical: 'مشكلات حرجة',
        found: 'صفحات وُجدت',
        checked: 'صفحات فُحصت',
        templates: 'قوالب',
        issues: 'مشكلات',
        new: 'جديدة',
        worsened: 'ساءت',
        fixed: 'أُصلحت',
        improved: 'تحسّنت',
        unchanged: 'كما هي',
      },
      partial: 'هذا فحص جزئي: بعض القواعد لم تعمل، فالدرجة تحسب ما عمل منها فقط.',
      failedScan: 'تعذّر قراءة الصفحة، فلا درجة ولا نتائج.',
      noFindings: 'لم نجد مشكلات في القواعد التي شغّلناها.',
      needsReview: 'تحتاج مراجعتك',
      howToFix: 'كيف تصلحها',
      moreFindings: (n) => `و${String(n)} مواضع أخرى لم تُذكر هنا.`,
      moreIssues: (n) => `و${String(n)} مشكلات أخرى لم تُذكر هنا.`,
      category: 'الفئة',
      score: 'الدرجة',
      before: 'قبل',
      after: 'بعد',
      change: 'التغيّر',
      browser: 'المتصفح',
      status: {
        rendered: 'عُرضت',
        failed: 'فشل',
        timeout: 'انتهت المهلة',
        unavailable: 'غير متاح',
        refused: 'مرفوض',
      },
      findings: 'نتائج',
      xrayLead: (percent) =>
        `نسبة الكلمات العربية المرسومة صحيحة: ${String(percent)}٪ عبر المتصفحات.`,
      xrayEngine: (engine, total, broken) =>
        `${engine}: ${String(broken)} كلمة مكسورة من ${String(total)}`,
      xrayWords: (words) => `الكلمات المكسورة: ${words}`,
      xrayAlt: (engine) => `أول شاشة من الصفحة كما رسمها ${engine}`,
      template: 'القالب',
      kinds: {
        home: 'الرئيسية',
        product: 'صفحة منتج',
        article: 'مقال',
        category: 'تصنيف',
        help: 'مساعدة',
        generic: 'صفحة عامة',
        standalone: 'صفحات منفردة',
      },
      pagesFound: 'وُجدت',
      pagesChecked: 'فُحصت',
      browserScore: 'درجة المتصفح',
      topIssues: 'أهم المشكلات',
      affected: (pages, checked) => `${String(pages)} من ${String(checked)} صفحة`,
      pagesOf: (pages) => arabicCount(pages, PAGES_AR),
      renderedTag: 'من المتصفحات',
      example: 'مثال',
      sameRulesNote: 'شغّل الفحصان القواعد نفسها، فالفرق في الدرجة هو فرق الصفحة.',
      differentRulesNote: 'اختلفت القواعد التي شغّلها الفحصان، فالفرق في الدرجة تقريبي.',
      omitted: (n) => `${String(n)} تغييرات أخرى لم تُذكر هنا.`,
      share: (before, after) => `${before} ← ${after}`,
      absent: '—',
    },
    ui: {
      button: 'تنزيل PDF',
      buttonLabel: (what) => `تنزيل ${what} بصيغة PDF`,
      preparing: 'نجهّز الملف… قد يستغرق دقيقة.',
      ready: 'الملف جاهز.',
      download: 'نزّل الملف',
      again: 'جهّز ملفاً جديداً',
      keptNote: (days) =>
        `نحتفظ بالملف ${arabicCount(days, DAYS_AR)} كما نحتفظ بالتقرير، ثم يُحذف.`,
      allowance: (used, perMonth) =>
        `استعملت ${String(used)} من ${String(perMonth)} ملفات هذا الشهر.`,
      failed: {
        'too-large': 'الملف كبير جداً. جرّب تقريراً أصغر.',
        timeout: 'استغرق تجهيز الملف أكثر من اللازم. جرّب مرة أخرى بعد قليل.',
        'scanner-unavailable': 'خدمة التجهيز مشغولة الآن. جرّب بعد قليل.',
        internal: 'تعذّر تجهيز الملف. جرّب مرة أخرى.',
      },
      problems: {
        network: 'لم نصل إلى الخادم. تأكد من الاتصال وجرّب مرة أخرى.',
        unavailable: 'الخدمة غير متاحة الآن. جرّب بعد قليل.',
        unauthorized: 'انتهت جلستك. سجّل الدخول مرة أخرى.',
        'not-found': 'لا نجد هذا التقرير في حسابك. ملفات PDF لتقاريرك أنت فقط.',
        conflict: 'عندك ملف قيد التجهيز. انتظر حتى ينتهي.',
        'plan-limit': 'وصلت إلى حدّ ملفات PDF لهذا الشهر في خطتك.',
        'bad-request': 'تعذّر طلب الملف. حدّث الصفحة وجرّب مرة أخرى.',
        'rate-limited': 'طلبات كثيرة. انتظر قليلاً.',
      },
      listTitle: 'ملفات PDF',
      listLead: 'الملفات التي جهّزتها. تُحذف مع تقاريرها، ومع حسابك إن حذفته.',
      listEmpty: 'لا ملفات بعد. اضغط «تنزيل PDF» في أي تقرير من تقاريرك.',
      kinds: {
        scan: 'فحص صفحة',
        crawl: 'زحف موقع',
        'compare-scans': 'مقارنة فحصين',
        'compare-crawls': 'مقارنة زحفين',
      },
      expired: 'انتهت مدة حفظه',
      size: (kb) => `${String(kb)} كيلوبايت`,
      brand: {
        title: 'علامتك على التقارير',
        lead: 'اسم شركتك وشعارها ولونها بدل علامة Arablyzer، على ملفات PDF وعلى صفحة التقرير المشاركة.',
        notIncluded: 'علامتك الخاصة غير متضمّنة في خطتك الحالية.',
        name: 'اسم الشركة',
        nameHint: 'حتى 60 حرفاً.',
        color: 'لون العلامة',
        colorHint: 'يُرسم عليه نص أبيض، فيجب أن يكون داكناً بما يكفي للقراءة.',
        colorFallback:
          'هذا اللون فاتح للنص الأبيض عليه، فنستعمل لون Arablyzer بدلاً منه. اختر لوناً أغمق.',
        noColor: 'بلا لون: نستعمل لون Arablyzer.',
        logo: 'الشعار',
        logoHint: 'PNG أو JPEG أو WebP، حتى 200 كيلوبايت وحتى 2048 بكسل في الضلع. لا نقبل SVG.',
        logoChoose: 'اختر صورة',
        logoRemove: 'احذف الشعار',
        logoNone: 'لا شعار.',
        logoProblems: {
          'too-large': 'الصورة أكبر من 200 كيلوبايت.',
          type: 'نقبل PNG وJPEG وWebP فقط.',
          dimensions: 'الصورة أكبر من 2048 بكسل في أحد ضلعيها.',
          corrupt: 'تعذّر قراءة الصورة. جرّب ملفاً آخر.',
          unavailable: 'تعذّر رفع الشعار. جرّب مرة أخرى.',
        },
        save: 'احفظ',
        saving: 'نحفظ…',
        saved: 'حفظنا علامتك.',
        loading: 'نقرأ إعدادات علامتك…',
        failed: 'تعذّر حفظ علامتك. جرّب مرة أخرى.',
        preview: 'هكذا تظهر',
        previewEmpty: 'اكتب اسم شركتك لترى المعاينة.',
        credit: 'بواسطة Arablyzer',
        logoAlt: (name) => `شعار ${name}`,
      },
    },
  },
  en: {
    doc: {
      mark: 'Arablyzer',
      creditBy: 'by Arablyzer',
      of: 'of',
      footer: (who, date) => `${who} · ${date}`,
      kicker: {
        scan: 'Page audit report',
        crawl: 'Site crawl report',
        'compare-scans': 'Comparison of two scans',
        'compare-crawls': 'Comparison of two crawls',
      },
      facts: {
        page: 'Page',
        site: 'Site',
        scanned: 'Scanned on',
        made: 'Report made on',
        browsers: 'Browsers',
        noBrowsers: 'No browser',
        found: 'Pages found',
        checked: 'Pages checked',
        templates: 'Templates',
        from: 'From report',
        to: 'To report',
      },
      overall: 'Overall score',
      noScore: 'No score',
      scoreNote: (ran, total) => `${String(ran)} of ${String(total)} rules ran`,
      crawlScoreNote: 'Mean score of the representative pages in the browsers',
      severity: {
        critical: 'Critical',
        serious: 'Serious',
        moderate: 'Moderate',
        minor: 'Minor',
        info: 'Info',
      },
      sections: {
        summary: 'Summary',
        categories: 'Score by category',
        severity: (label, count) => `${label} (${String(count)})`,
        xray: 'Arabic X-ray',
        notes: 'Scan notes',
        templates: 'Templates',
        engines: 'Browsers',
        changes: {
          new: 'New issues',
          worsened: 'Issues that got worse',
          fixed: 'Issues fixed',
          improved: 'Issues that improved',
        },
      },
      stats: {
        passed: 'Rules passed',
        failed: 'Rules failed',
        review: 'Need review',
        critical: 'Critical issues',
        found: 'Pages found',
        checked: 'Pages checked',
        templates: 'Templates',
        issues: 'Issues',
        new: 'New',
        worsened: 'Worse',
        fixed: 'Fixed',
        improved: 'Improved',
        unchanged: 'Unchanged',
      },
      partial:
        'This scan is partial: some rules could not run, so the score counts only those that did.',
      failedScan: 'The page could not be read, so there is no score and no findings.',
      noFindings: 'We found no problems in the rules we ran.',
      needsReview: 'Needs your review',
      howToFix: 'How to fix it',
      moreFindings: (n) => `And ${String(n)} more places not listed here.`,
      moreIssues: (n) => `And ${String(n)} more issues not listed here.`,
      category: 'Category',
      score: 'Score',
      before: 'Before',
      after: 'After',
      change: 'Change',
      browser: 'Browser',
      status: {
        rendered: 'Rendered',
        failed: 'Failed',
        timeout: 'Timed out',
        unavailable: 'Unavailable',
        refused: 'Refused',
      },
      findings: 'findings',
      xrayLead: (percent) =>
        `${String(percent)}% of the Arabic words are drawn correctly across the browsers.`,
      xrayEngine: (engine, total, broken) =>
        `${engine}: ${englishCount(broken, 'broken word', 'broken words')} of ${String(total)}`,
      xrayWords: (words) => `Broken words: ${words}`,
      xrayAlt: (engine) => `The first screen of the page as ${engine} drew it`,
      template: 'Template',
      kinds: {
        home: 'Home page',
        product: 'Product page',
        article: 'Article',
        category: 'Category',
        help: 'Help',
        generic: 'Generic page',
        standalone: 'Standalone pages',
      },
      pagesFound: 'Found',
      pagesChecked: 'Checked',
      browserScore: 'Browser score',
      topIssues: 'Top issues',
      affected: (pages, checked) => `${String(pages)} of ${String(checked)} pages`,
      pagesOf: (pages) => englishCount(pages, 'page', 'pages'),
      renderedTag: 'From the browsers',
      example: 'Example',
      sameRulesNote: 'Both scans ran the same rules, so the score difference is the page’s.',
      differentRulesNote:
        'The two scans ran different rules, so the score difference is approximate.',
      omitted: (n) => `${String(n)} more changes not listed here.`,
      share: (before, after) => `${before} → ${after}`,
      absent: '—',
    },
    ui: {
      button: 'Download PDF',
      buttonLabel: (what) => `Download ${what} as a PDF`,
      preparing: 'Preparing the file… this can take a minute.',
      ready: 'The file is ready.',
      download: 'Download the file',
      again: 'Prepare a new file',
      keptNote: (days) =>
        `We keep the file for ${englishCount(days, 'day', 'days')}, as long as the report, then delete it.`,
      allowance: (used, perMonth) =>
        `You have used ${String(used)} of ${String(perMonth)} files this month.`,
      failed: {
        'too-large': 'The file is too large. Try a smaller report.',
        timeout: 'Preparing the file took too long. Try again in a moment.',
        'scanner-unavailable': 'The preparing service is busy right now. Try again in a moment.',
        internal: 'We could not prepare the file. Try again.',
      },
      problems: {
        network: 'We could not reach the server. Check your connection and try again.',
        unavailable: 'The service is unavailable right now. Try again in a moment.',
        unauthorized: 'Your session ended. Sign in again.',
        'not-found': 'We cannot find this report in your account. PDFs are for your own reports.',
        conflict: 'You have a file being prepared. Wait for it to finish.',
        'plan-limit': 'You have reached your plan’s PDF limit for this month.',
        'bad-request': 'We could not ask for the file. Reload the page and try again.',
        'rate-limited': 'Too many requests. Wait a little.',
      },
      listTitle: 'PDF files',
      listLead:
        'The files you prepared. They are deleted with their reports, and with your account if you delete it.',
      listEmpty: 'No files yet. Press “Download PDF” on any of your reports.',
      kinds: {
        scan: 'Page scan',
        crawl: 'Site crawl',
        'compare-scans': 'Scan comparison',
        'compare-crawls': 'Crawl comparison',
      },
      expired: 'No longer kept',
      size: (kb) => `${String(kb)} KB`,
      brand: {
        title: 'Your brand on reports',
        lead: 'Your company’s name, logo and colour in place of Arablyzer’s mark, on PDFs and on the shared report page.',
        notIncluded: 'Your own brand is not included in your current plan.',
        name: 'Company name',
        nameHint: 'Up to 60 characters.',
        color: 'Brand colour',
        colorHint: 'White text is drawn on it, so it must be dark enough to read.',
        colorFallback:
          'White text is too faint on this colour, so we use Arablyzer’s colour instead. Choose a darker one.',
        noColor: 'No colour: we use Arablyzer’s.',
        logo: 'Logo',
        logoHint: 'PNG, JPEG or WebP, up to 200 KB and 2048 pixels on a side. SVG is not accepted.',
        logoChoose: 'Choose an image',
        logoRemove: 'Remove the logo',
        logoNone: 'No logo.',
        logoProblems: {
          'too-large': 'The image is larger than 200 KB.',
          type: 'Only PNG, JPEG and WebP are accepted.',
          dimensions: 'The image is larger than 2048 pixels on a side.',
          corrupt: 'We could not read the image. Try another file.',
          unavailable: 'We could not upload the logo. Try again.',
        },
        save: 'Save',
        saving: 'Saving…',
        saved: 'Your brand is saved.',
        loading: 'Reading your brand settings…',
        failed: 'We could not save your brand. Try again.',
        preview: 'How it looks',
        previewEmpty: 'Type your company name to see the preview.',
        credit: 'by Arablyzer',
        logoAlt: (name) => `${name} logo`,
      },
    },
  },
}

import type { CrawlError, CrawlState, ScanState, TemplateKind } from '@arablyzer/api-contract/codes'
import type { Copy } from './copy'
import { arabicCount, englishCount, type ArabicForms } from './plural'

/** «50 pages»: a page count, on its own or as the object of a verb. */
const PAGES: ArabicForms = {
  one: 'صفحة واحدة',
  two: 'صفحتان',
  few: '{n} صفحات',
  many: '{n} صفحة',
  other: '{n} صفحة',
}
/** «3 templates». */
const TEMPLATES: ArabicForms = {
  one: 'قالب واحد',
  two: 'قالبان',
  few: '{n} قوالب',
  many: '{n} قالباً',
  other: '{n} قالب',
}

export interface CrawlStrings {
  /** The site card's row (M4.5). */
  readonly row: {
    readonly none: string
    readonly start: string
    readonly starting: string
    readonly cancel: string
    readonly cancelling: string
    readonly open: string
    readonly close: string
    readonly states: Readonly<Record<CrawlState, string>>
    /** «12 of 50 pages». */
    readonly progress: (checked: number, cap: number) => string
    /** «Browsers: 2 of 4 pages». */
    readonly browsers: (done: number, total: number) => string
    /** «50 pages in 6 templates». */
    readonly summary: (pages: number, templates: number) => string
    /** What the plan lets a crawl read. */
    readonly cap: (pages: number) => string
    readonly failed: Readonly<Record<CrawlError, string>>
  }
  readonly report: {
    readonly title: string
    readonly lead: string
    readonly loading: string
    readonly unavailable: string
    readonly waitingLead: string
    readonly summary: {
      readonly origin: string
      readonly found: (n: number) => string
      readonly checked: (n: number, cap: number) => string
      readonly templates: (n: number) => string
      readonly browsers: (done: number, total: number) => string
      readonly finished: (date: string) => string
    }
    readonly cancel: string
    readonly cancelling: string
    readonly remove: string
    readonly removing: string
    readonly close: string
    readonly templatesTitle: string
    readonly templatesLead: string
    readonly kinds: Readonly<Record<TemplateKind, string>>
    /** «Product page · /products/:slug»: the kind and the address pattern. */
    readonly templateName: (kind: string, pattern: string) => string
    readonly standalonePattern: string
    /** «40 pages found, 12 checked». */
    readonly counts: (found: number, checked: number) => string
    readonly noIssues: string
    readonly topIssues: string
    readonly browsersTitle: string
    readonly notScanned: string
    readonly scanStates: Readonly<Record<ScanState, string>>
    readonly score: string
    readonly openReport: string
    readonly showPages: string
    readonly hidePages: string
    readonly issuesTitle: string
    readonly issuesLead: string
    readonly issuesEmpty: string
    readonly issueColumn: string
    readonly totalColumn: string
    /** Found by the browsers on the representatives, not by the HTML checks on every page. */
    readonly renderedTag: string
    readonly renderedNote: string
    /** «38 of 40»: pages with the issue, of pages checked. */
    readonly cell: (n: number, of: number) => string
    readonly cellLabel: (template: string, n: number, of: number) => string
    readonly examples: string
    readonly showAll: (n: number) => string
    readonly showLess: string
    readonly pagesTitle: string
    readonly pagesEmpty: string
    readonly loadMore: string
    readonly loadingMore: string
    readonly pageStates: Readonly<Record<'found' | 'checked' | 'blocked' | 'failed', string>>
    /** «3 issues». */
    readonly pageIssues: (n: number) => string
    readonly status: string
    readonly openPage: string
    readonly browserScan: string
  }
}

export const CRAWL_UI: Copy<CrawlStrings> = {
  reviewed: false,
  ar: {
    row: {
      none: 'لم يُزحف إلى هذا الموقع بعد.',
      start: 'ازحف عميقاً',
      starting: 'نبدأ الزحف…',
      cancel: 'ألغِ الزحف',
      cancelling: 'نلغي الزحف…',
      open: 'افتح تقرير الزحف',
      close: 'أغلق التقرير',
      states: {
        queued: 'في الانتظار',
        running: 'يزحف الآن',
        rendering: 'يفتح الصفحات الممثِّلة في المتصفحات',
        done: 'اكتمل',
        failed: 'تعذّر',
        cancelled: 'أُلغي',
      },
      progress: (checked, cap) => `فُحصت ${checked} من أصل ${arabicCount(cap, PAGES)}`,
      browsers: (done, total) => `المتصفحات: ${done} من ${total}`,
      summary: (pages, templates) =>
        `${arabicCount(pages, PAGES)} في ${arabicCount(templates, TEMPLATES)}`,
      cap: (pages) => `يفحص الزحف حتى ${arabicCount(pages, PAGES)} حسب خطتك.`,
      failed: {
        unreachable: 'تعذّر الوصول إلى الموقع.',
        'blocked-by-robots': 'يمنع ملف robots.txt في الموقع الزحف إليه.',
        'not-html': 'الصفحة الرئيسية ليست صفحة HTML.',
        'scanner-unavailable': 'خدمة الفحص غير متاحة الآن. أعد المحاولة بعد قليل.',
        internal: 'حدث خطأ عندنا. أعد المحاولة.',
      },
    },
    report: {
      title: 'تقرير الزحف',
      lead: 'نجمع صفحات الموقع في قوالب (صفحة منتج، مقال، تصنيف…) بحسب شكل الرابط وبناء الصفحة. كل صفحة تُفحص على HTML وحده، وتُفتح صفحة ممثِّلة من كل قالب في المتصفحات الثلاثة. فالمشكلة التي تظهر في القالب تظهر في صفحاته كلها غالباً.',
      loading: 'نفتح التقرير…',
      unavailable: 'تعذّر فتح تقرير الزحف. أعد المحاولة بعد قليل.',
      waitingLead:
        'نزحف إلى صفحات الموقع الآن بوتيرة هادئة ونحترم ملف robots.txt. سيظهر التقرير هنا حين تُجمع الصفحات في قوالب.',
      summary: {
        origin: 'الموقع',
        found: (n) => `وجدنا ${arabicCount(n, PAGES)}`,
        checked: (n, cap) => `فحصنا ${n} من حدّ أقصاه ${cap}`,
        templates: (n) => arabicCount(n, TEMPLATES),
        browsers: (done, total) => `المتصفحات: ${done} من ${total} صفحة ممثِّلة`,
        finished: (date) => `انتهى في ${date}`,
      },
      cancel: 'ألغِ الزحف',
      cancelling: 'نلغي الزحف…',
      remove: 'احذف التقرير',
      removing: 'نحذف التقرير…',
      close: 'أغلق',
      templatesTitle: 'القوالب',
      templatesLead: 'القالب هو مجموعة صفحات تُبنى بالطريقة نفسها. سمّيناه من شكل الرابط.',
      kinds: {
        home: 'الصفحة الرئيسية',
        product: 'صفحة منتج',
        article: 'مقال',
        category: 'تصنيف',
        help: 'مساعدة',
        generic: 'صفحات',
        standalone: 'صفحات منفردة',
      },
      templateName: (kind, pattern) => `${kind} · ${pattern}`,
      standalonePattern: 'صفحات لا يجمعها شكل رابط واحد',
      counts: (found, checked) => `وجدنا ${arabicCount(found, PAGES)}، وفحصنا ${checked}`,
      noIssues: 'لا مشاكل في صفحاته التي فحصناها.',
      topIssues: 'أبرز المشاكل',
      browsersTitle: 'الصفحة الممثِّلة في المتصفحات',
      notScanned: 'لم يبدأ فحصها بعد',
      scanStates: {
        queued: 'في الانتظار',
        running: 'يعمل الآن',
        complete: 'اكتمل',
        partial: 'اكتمل جزئياً',
        failed: 'تعذّر',
      },
      score: 'الدرجة',
      openReport: 'افتح التقرير',
      showPages: 'اعرض صفحاته',
      hidePages: 'أخفِ صفحاته',
      issuesTitle: 'المشاكل بحسب القالب',
      issuesLead: 'في كل خلية عدد الصفحات التي فيها المشكلة من الصفحات المفحوصة في القالب.',
      issuesEmpty: 'لم نجد مشاكل في الصفحات المفحوصة.',
      issueColumn: 'المشكلة',
      totalColumn: 'الصفحات',
      renderedTag: 'من المتصفحات',
      renderedNote:
        'وجدتها المتصفحات في الصفحة الممثِّلة. نفترض أنها في بقية صفحات القالب ولم نتحقق من كل صفحة.',
      cell: (n, of) => `${n} من ${of}`,
      cellLabel: (template, n, of) => `${template}: ${n} من ${of}`,
      examples: 'أمثلة',
      showAll: (n) => `اعرض كل المشاكل (${n})`,
      showLess: 'اعرض أقل',
      pagesTitle: 'الصفحات',
      pagesEmpty: 'لا صفحات هنا.',
      loadMore: 'اعرض المزيد',
      loadingMore: 'نحمّل المزيد…',
      pageStates: {
        found: 'لم تُفحص',
        checked: 'فُحصت',
        blocked: 'يمنعها robots.txt',
        failed: 'تعذّرت',
      },
      pageIssues: (n) => (n === 0 ? 'بلا مشاكل' : `${n} مشكلة`),
      status: 'الحالة',
      openPage: 'افتح الصفحة',
      browserScan: 'فحص المتصفحات',
    },
  },
  en: {
    row: {
      none: 'This site has not been crawled yet.',
      start: 'Deep crawl',
      starting: 'Starting the crawl…',
      cancel: 'Cancel the crawl',
      cancelling: 'Cancelling…',
      open: 'Open the crawl report',
      close: 'Close the report',
      states: {
        queued: 'Waiting',
        running: 'Crawling now',
        rendering: 'Opening the representative pages in the browsers',
        done: 'Done',
        failed: 'Failed',
        cancelled: 'Cancelled',
      },
      progress: (checked, cap) =>
        `${checked} of up to ${englishCount(cap, 'page', 'pages')} checked`,
      browsers: (done, total) => `Browsers: ${done} of ${total}`,
      summary: (pages, templates) =>
        `${englishCount(pages, 'page', 'pages')} in ${englishCount(templates, 'template', 'templates')}`,
      cap: (pages) => `Your plan lets a crawl check up to ${englishCount(pages, 'page', 'pages')}.`,
      failed: {
        unreachable: 'We could not reach the site.',
        'blocked-by-robots': 'The site’s robots.txt does not allow crawling it.',
        'not-html': 'The home page is not an HTML page.',
        'scanner-unavailable':
          'The scanning service is not available right now. Try again in a moment.',
        internal: 'Something went wrong on our side. Try again.',
      },
    },
    report: {
      title: 'Crawl report',
      lead: 'We group the site’s pages into templates (a product page, an article, a category…) by the shape of the address and the way the page is built. Every page gets the HTML checks, and one representative page of each template is opened in all three browsers. An issue on a template is usually on all of its pages.',
      loading: 'Opening the report…',
      unavailable: 'We could not open the crawl report. Try again in a moment.',
      waitingLead:
        'We are reading the site’s pages at a gentle pace, and we respect its robots.txt. The report appears here once the pages are grouped into templates.',
      summary: {
        origin: 'Site',
        found: (n) => `${englishCount(n, 'page', 'pages')} found`,
        checked: (n, cap) => `${n} checked, up to ${cap}`,
        templates: (n) => englishCount(n, 'template', 'templates'),
        browsers: (done, total) => `Browsers: ${done} of ${total} representative pages`,
        finished: (date) => `Finished ${date}`,
      },
      cancel: 'Cancel the crawl',
      cancelling: 'Cancelling…',
      remove: 'Delete the report',
      removing: 'Deleting the report…',
      close: 'Close',
      templatesTitle: 'Templates',
      templatesLead:
        'A template is a set of pages built the same way. We name it from the shape of its address.',
      kinds: {
        home: 'Home page',
        product: 'Product page',
        article: 'Article',
        category: 'Category',
        help: 'Help',
        generic: 'Pages',
        standalone: 'Standalone pages',
      },
      templateName: (kind, pattern) => `${kind} · ${pattern}`,
      standalonePattern: 'pages that share no address shape',
      counts: (found, checked) =>
        `${englishCount(found, 'page', 'pages')} found, ${checked} checked`,
      noIssues: 'No issues on the pages we checked.',
      topIssues: 'Top issues',
      browsersTitle: 'Representative page in the browsers',
      notScanned: 'Not started yet',
      scanStates: {
        queued: 'Waiting',
        running: 'Running',
        complete: 'Complete',
        partial: 'Partly complete',
        failed: 'Failed',
      },
      score: 'Score',
      openReport: 'Open the report',
      showPages: 'Show its pages',
      hidePages: 'Hide its pages',
      issuesTitle: 'Issues by template',
      issuesLead:
        'Each cell is the number of pages with the issue, of the pages checked in that template.',
      issuesEmpty: 'We found no issues on the pages we checked.',
      issueColumn: 'Issue',
      totalColumn: 'Pages',
      renderedTag: 'From the browsers',
      renderedNote:
        'The browsers found this on the representative page. We assume it is on the template’s other pages; we did not check each one.',
      cell: (n, of) => `${n} of ${of}`,
      cellLabel: (template, n, of) => `${template}: ${n} of ${of}`,
      examples: 'Examples',
      showAll: (n) => `Show all issues (${n})`,
      showLess: 'Show fewer',
      pagesTitle: 'Pages',
      pagesEmpty: 'No pages here.',
      loadMore: 'Show more',
      loadingMore: 'Loading more…',
      pageStates: {
        found: 'Not checked',
        checked: 'Checked',
        blocked: 'Kept out by robots.txt',
        failed: 'Failed',
      },
      pageIssues: (n) => (n === 0 ? 'No issues' : englishCount(n, 'issue', 'issues')),
      status: 'Status',
      openPage: 'Open the page',
      browserScan: 'Browser scan',
    },
  },
}

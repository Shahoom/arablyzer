import type {
  ChangeKind,
  EngineName,
  RenderStatusName,
  SeverityName,
} from '@arablyzer/api-contract/codes'
import type { Copy } from './copy'

/** The words of the comparison page and the score history chart (M4.6). Numbers come from the API. */
export interface CompareStrings {
  readonly page: { readonly title: string; readonly description: string }
  /** The links that lead to a comparison. */
  readonly links: {
    readonly previousScan: string
    readonly previousCrawl: string
    /** «Compare with the scan of 3 Oct» for a screen reader. */
    readonly previousScanLabel: (date: string) => string
  }
  readonly history: {
    readonly show: string
    readonly hide: string
    readonly title: string
    readonly lead: (days: number) => string
    readonly loading: string
    readonly failed: string
    readonly empty: string
    readonly chartLabel: (url: string) => string
    /** «Overall score from 70 to 82, over 5 scans.» */
    readonly summaryMany: (count: number, first: number, last: number) => string
    readonly summaryOne: (score: number, date: string) => string
    /** «From 3 Oct to 9 Oct.» */
    readonly period: (from: string, to: string) => string
    readonly linesTitle: string
    readonly overall: string
    readonly scoreAxis: string
    readonly source: Readonly<Record<'manual' | 'monitor', string>>
    readonly alertsNote: string
    readonly noAlerts: string
    readonly markers: {
      readonly 'score-drop': (from: number, to: number) => string
      readonly critical: (count: number) => string
      readonly down: string
    }
    readonly markerLegend: string
    /** The shape's name in the legend, with no numbers. */
    readonly markerKinds: {
      readonly 'score-drop': string
      readonly critical: string
      readonly down: string
    }
    readonly unreached: string
    readonly table: {
      readonly show: string
      readonly hide: string
      readonly caption: string
      readonly date: string
      readonly source: string
      readonly alert: string
    }
    readonly openReport: string
  }
  readonly compare: {
    readonly title: string
    readonly lead: string
    readonly loading: string
    readonly back: string
    readonly problems: Readonly<
      Record<'not-comparable' | 'not-found' | 'unauthorized' | 'other', string>
    >
    readonly reports: {
      readonly title: string
      readonly base: string
      readonly head: string
      readonly openReport: string
      readonly crawlOf: (origin: string) => string
    }
    readonly score: {
      readonly title: string
      readonly overall: string
      readonly before: string
      readonly after: string
      readonly change: string
      readonly none: string
      readonly better: string
      readonly worse: string
      readonly same: string
      readonly rulesNote: string
    }
    readonly categories: { readonly title: string; readonly category: string }
    readonly engines: {
      readonly title: string
      readonly engine: string
      readonly status: string
      readonly findings: string
      readonly none: string
      readonly names: Readonly<Record<EngineName, string>>
      readonly states: Readonly<Record<RenderStatusName, string>>
      readonly notRun: string
    }
    readonly changes: {
      readonly title: string
      readonly none: string
      readonly kinds: Readonly<Record<ChangeKind, string>>
      readonly kindHints: Readonly<Record<ChangeKind, string>>
      readonly severity: Readonly<Record<SeverityName, string>>
      readonly severityChange: (from: string, to: string) => string
      readonly seenIn: string
      readonly showUnchanged: (n: number) => string
      readonly hideUnchanged: string
      readonly omitted: (n: number) => string
    }
    readonly crawl: {
      readonly templatesTitle: string
      readonly templatesLead: string
      readonly template: string
      readonly pages: string
      readonly score: string
      readonly appeared: string
      readonly gone: string
      readonly pagesOf: (found: number, checked: number) => string
      readonly issuesTitle: string
      readonly issuesLead: string
      readonly share: (pages: number, checked: number) => string
      readonly rendered: string
    }
  }
}

export const COMPARE_UI: Copy<CompareStrings> = {
  reviewed: false,
  ar: {
    page: {
      title: 'مقارنة تقريرين',
      description: 'ما أُصلح وما ظهر وما ساء بين تقريرين لموقعك.',
    },
    links: {
      previousScan: 'قارن مع الفحص السابق',
      previousCrawl: 'قارن مع الزحف السابق',
      previousScanLabel: (date) => `قارن مع فحص ${date}`,
    },
    history: {
      show: 'اعرض مخطط الدرجات',
      hide: 'أخفِ مخطط الدرجات',
      title: 'درجات الموقع عبر الزمن',
      lead: (days) =>
        `فحوصك لهذا الموقع، اليدوية وفحوص المراقبة، خلال آخر ${days} يوماً من سجل خطتك.`,
      loading: 'نجهّز المخطط…',
      failed: 'تعذّر تحميل المخطط. أعد المحاولة بعد قليل.',
      empty: 'لا فحوصاً لهذا الموقع في هذه المدة بعد. افحصه ليبدأ المخطط.',
      chartLabel: (url) => `مخطط درجات ${url} عبر الزمن`,
      summaryMany: (count, first, last) =>
        `الدرجة العامة من ${first} إلى ${last}، عبر ${count} فحصاً.`,
      summaryOne: (score, date) => `فحص واحد: الدرجة العامة ${score} في ${date}.`,
      period: (from, to) => `المدة من ${from} إلى ${to}.`,
      linesTitle: 'الخطوط',
      overall: 'الدرجة العامة',
      scoreAxis: 'الدرجة',
      source: { manual: 'يدوي', monitor: 'مراقبة' },
      alertsNote:
        'علامات التنبيه تبيّن أين كانت المراقبة ستنبّهك بإعداداتك الحالية. لا نحفظ التنبيهات الماضية، فنحسبها من الفحوص.',
      noAlerts: 'لا تنبيهات في هذه المدة.',
      markers: {
        'score-drop': (from, to) => `نزلت الدرجة من ${from} إلى ${to}`,
        critical: (count) => `مشكلات حرجة جديدة: ${count}`,
        down: 'تعذّر الوصول إلى الموقع',
      },
      markerLegend: 'علامات التنبيه',
      markerKinds: {
        'score-drop': 'نزول في الدرجة',
        critical: 'مشكلات حرجة جديدة',
        down: 'تعذّر الوصول',
      },
      unreached: 'لم يصل الفحص إلى الصفحة',
      table: {
        show: 'اعرض الأرقام في جدول',
        hide: 'أخفِ الجدول',
        caption: 'درجات كل فحص',
        date: 'التاريخ',
        source: 'النوع',
        alert: 'تنبيه',
      },
      openReport: 'افتح التقرير',
    },
    compare: {
      title: 'مقارنة تقريرين',
      lead: 'ما تغيّر بين تقريرين لموقع واحد: ما أُصلح، وما ظهر جديداً، وما ساء، وما بقي كما هو.',
      loading: 'نقارن التقريرين…',
      back: 'العودة إلى حسابي',
      problems: {
        'not-comparable':
          'لا نستطيع مقارنة هذين التقريرين: يجب أن يكونا لموقع واحد، وأن ينتهيا بتقرير كامل.',
        'not-found': 'لم نجد أحد التقريرين في حسابك. ربما حُذف بعد انتهاء مدة السجل.',
        unauthorized: 'لم تسجّل الدخول.',
        other: 'تعذّرت المقارنة. أعد المحاولة بعد قليل.',
      },
      reports: {
        title: 'التقريران',
        base: 'الأقدم',
        head: 'الأحدث',
        openReport: 'افتح التقرير',
        crawlOf: (origin) => `زحف ${origin}`,
      },
      score: {
        title: 'الدرجة',
        overall: 'العامة',
        before: 'قبل',
        after: 'بعد',
        change: 'الفرق',
        none: 'بلا درجة',
        better: 'تحسّنت',
        worse: 'نزلت',
        same: 'لم تتغيّر',
        rulesNote: 'شغّل الفحصان قواعد مختلفة، فالفرق بين الدرجتين ليس من الصفحة وحدها.',
      },
      categories: { title: 'الدرجة حسب الفئة', category: 'الفئة' },
      engines: {
        title: 'المتصفحات',
        engine: 'المتصفح',
        status: 'الحالة',
        findings: 'مشكلات ظهرت فيه',
        none: 'لم يُعرض أي منهما في متصفح، فلا مقارنة بين المتصفحات.',
        names: { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' },
        states: {
          rendered: 'عُرضت',
          failed: 'تعذّر العرض',
          timeout: 'انتهى الوقت',
          unavailable: 'غير متاح',
          refused: 'لا يعمل هنا',
        },
        notRun: 'لم يعمل',
      },
      changes: {
        title: 'المشكلات',
        none: 'لا مشكلات في أي من التقريرين.',
        kinds: {
          new: 'ظهرت جديدة',
          worsened: 'ساءت',
          fixed: 'أُصلحت',
          improved: 'خفّت',
          unchanged: 'بقيت كما هي',
        },
        kindHints: {
          new: 'ليست في الأقدم وهي في الأحدث.',
          worsened: 'صارت أشد خطورة.',
          fixed: 'كانت في الأقدم وليست في الأحدث.',
          improved: 'صارت أخف خطورة.',
          unchanged: 'في التقريرين بالخطورة نفسها.',
        },
        severity: {
          critical: 'حرجة',
          serious: 'خطيرة',
          moderate: 'متوسطة',
          minor: 'طفيفة',
          info: 'معلومة',
        },
        severityChange: (from, to) => `من ${from} إلى ${to}`,
        seenIn: 'ظهرت في',
        showUnchanged: (n) => `اعرض ما لم يتغيّر (${n})`,
        hideUnchanged: 'أخفِ ما لم يتغيّر',
        omitted: (n) => `بقي ${n} من التغييرات خارج القائمة.`,
      },
      crawl: {
        templatesTitle: 'القوالب',
        templatesLead: 'نطابق القالب بشكل عنوانه، فلا يهم الاسم الذي أعطاه كل زحف.',
        template: 'القالب',
        pages: 'صفحاته',
        score: 'درجة المتصفحات',
        appeared: 'قالب جديد',
        gone: 'لم يعد موجوداً',
        pagesOf: (found, checked) => `${found} صفحة، فُحصت منها ${checked}`,
        issuesTitle: 'المشكلات حسب القالب',
        issuesLead: 'كل رقم هو الصفحات التي فيها المشكلة من الصفحات المفحوصة في القالب.',
        share: (pages, checked) => `${pages} من ${checked}`,
        rendered: 'من المتصفحات',
      },
    },
  },
  en: {
    page: {
      title: 'Compare two reports',
      description:
        'What was fixed, what appeared and what got worse between two reports of your site.',
    },
    links: {
      previousScan: 'Compare with the previous scan',
      previousCrawl: 'Compare with the previous crawl',
      previousScanLabel: (date) => `Compare with the scan of ${date}`,
    },
    history: {
      show: 'Show the score chart',
      hide: 'Hide the score chart',
      title: 'Scores over time',
      lead: (days) =>
        `Your scans of this site, by hand and by monitoring, over the last ${days} days your plan keeps.`,
      loading: 'Preparing the chart…',
      failed: 'We could not load the chart. Try again in a moment.',
      empty: 'No scans of this site in this period yet. Scan it to start the chart.',
      chartLabel: (url) => `Chart of the scores of ${url} over time`,
      summaryMany: (count, first, last) =>
        `Overall score from ${first} to ${last}, over ${count} scans.`,
      summaryOne: (score, date) => `One scan: overall score ${score} on ${date}.`,
      period: (from, to) => `From ${from} to ${to}.`,
      linesTitle: 'Lines',
      overall: 'Overall',
      scoreAxis: 'Score',
      source: { manual: 'By hand', monitor: 'Monitoring' },
      alertsNote:
        'Alert marks show where monitoring would have alerted you at your current settings. Past alerts are not stored, so they are worked out from the scans.',
      noAlerts: 'No alerts in this period.',
      markers: {
        'score-drop': (from, to) => `Score fell from ${from} to ${to}`,
        critical: (count) => `New critical issues: ${count}`,
        down: 'The site could not be reached',
      },
      markerLegend: 'Alert marks',
      markerKinds: {
        'score-drop': 'Score drop',
        critical: 'New critical issues',
        down: 'Site unreachable',
      },
      unreached: 'The scan did not reach the page',
      table: {
        show: 'Show the numbers as a table',
        hide: 'Hide the table',
        caption: 'The score of each scan',
        date: 'Date',
        source: 'Kind',
        alert: 'Alert',
      },
      openReport: 'Open the report',
    },
    compare: {
      title: 'Compare two reports',
      lead: 'What changed between two reports of one site: what was fixed, what is new, what got worse and what stayed.',
      loading: 'Comparing the two reports…',
      back: 'Back to my account',
      problems: {
        'not-comparable':
          'We cannot compare these two reports: they must be of one site, and both must have ended with a full report.',
        'not-found':
          'We could not find one of the reports in your account. It may have been removed when its history days ended.',
        unauthorized: 'You are not signed in.',
        other: 'The comparison failed. Try again in a moment.',
      },
      reports: {
        title: 'The two reports',
        base: 'Earlier',
        head: 'Later',
        openReport: 'Open the report',
        crawlOf: (origin) => `Crawl of ${origin}`,
      },
      score: {
        title: 'Score',
        overall: 'Overall',
        before: 'Before',
        after: 'After',
        change: 'Change',
        none: 'No score',
        better: 'Improved',
        worse: 'Dropped',
        same: 'No change',
        rulesNote:
          'The two scans ran different rules, so the difference between the scores is not only the page’s.',
      },
      categories: { title: 'Score by category', category: 'Category' },
      engines: {
        title: 'Browsers',
        engine: 'Browser',
        status: 'Status',
        findings: 'Issues seen in it',
        none: 'Neither report was rendered in a browser, so there is nothing to compare between browsers.',
        names: { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' },
        states: {
          rendered: 'Rendered',
          failed: 'Could not render',
          timeout: 'Timed out',
          unavailable: 'Not available',
          refused: 'Does not run here',
        },
        notRun: 'Did not run',
      },
      changes: {
        title: 'Issues',
        none: 'No issues in either report.',
        kinds: {
          new: 'New',
          worsened: 'Got worse',
          fixed: 'Fixed',
          improved: 'Got better',
          unchanged: 'Unchanged',
        },
        kindHints: {
          new: 'Not in the earlier report, in the later one.',
          worsened: 'More severe than before.',
          fixed: 'In the earlier report, not in the later one.',
          improved: 'Less severe than before.',
          unchanged: 'In both reports, at the same severity.',
        },
        severity: {
          critical: 'Critical',
          serious: 'Serious',
          moderate: 'Moderate',
          minor: 'Minor',
          info: 'Info',
        },
        severityChange: (from, to) => `from ${from} to ${to}`,
        seenIn: 'Seen in',
        showUnchanged: (n) => `Show the unchanged (${n})`,
        hideUnchanged: 'Hide the unchanged',
        omitted: (n) => `${n} more changes are not listed.`,
      },
      crawl: {
        templatesTitle: 'Templates',
        templatesLead:
          'A template is matched by the shape of its address, whatever name each crawl gave it.',
        template: 'Template',
        pages: 'Its pages',
        score: 'Browser score',
        appeared: 'New template',
        gone: 'No longer there',
        pagesOf: (found, checked) => `${found} pages, ${checked} checked`,
        issuesTitle: 'Issues by template',
        issuesLead:
          'Each number is the pages with the issue, of the pages checked in that template.',
        share: (pages, checked) => `${pages} of ${checked}`,
        rendered: 'From the browsers',
      },
    },
  },
}

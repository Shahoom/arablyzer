import type { Copy } from './copy'
import { arabicCount, englishForm } from './plural'

/**
 * A tool page's tool (M2.2): its form, and its result under it. The page's island loads these
 * alone, not the directory's and the categories' words (TOOLS_UI), which the page's HTML has.
 */
export interface ToolAppStrings {
  readonly form: {
    readonly urlLabel: string
    readonly submit: string
    readonly submitting: string
    /**
     * The line of meta text under the field (M2.6 R7): what the tool reads, before its name, as in
     * «يقرأ: HTML». The line is all that is said of what it reads: the box's fine print is
     * ScanNote's (scan-form.ts).
     */
    readonly reads: string
    /** The same line for a tool that opens the page in browsers: it comes before their three names. */
    readonly rendersIn: string
    /**
     * What a tool sends to a host that is not ours, which its box's disclosure says beside what is
     * kept: the DNS tool puts the page's domain to a resolver.
     */
    readonly sentOut: Readonly<Partial<Record<string, string>>>
  }
  readonly result: {
    readonly running: string
    readonly problems: (count: number) => string
    /**
     * What a tool found that only lists (an information rule), counted as notes: a note is not a
     * problem, and is never deducted (M2.3c review).
     */
    readonly notes: (count: number) => string
    readonly passed: string
    /** A tool of information rules alone, and nothing found: it does not "pass" what it never judged. */
    readonly noneFound: string
    readonly notApplicable: string
    readonly review: string
    /** The scan did not finish (partial or failed), or a rule could not run. */
    readonly incomplete: string
    /** Over the list of the tool's rules, each with what became of it. */
    readonly checked: string
    /** A rule's status, next to its title in that list. */
    readonly status: Readonly<
      Record<'pass' | 'fail' | 'needs-review' | 'not-applicable' | 'error', string>
    >
    /**
     * The status of a rule that only lists what it finds, in that list: what it found, and that it
     * found nothing (in a tool that judges too, an information rule that found nothing passes).
     */
    readonly information: Readonly<Record<'found' | 'none', string>>
    /** Before the ids of the rules the tool ran. */
    readonly rules: (count: number) => string
    readonly share: string
    readonly howToFix: string
    readonly blocked: string
    /** The site's robots.txt asks ArablyzerBot not to check the page (M2.4 plan §2). */
    readonly optedOut: string
    readonly failed: string
    readonly offline: string
  }
}

export const TOOL_APP: Copy<ToolAppStrings> = {
  reviewed: false,
  ar: {
    form: {
      urlLabel: 'رابط الصفحة',
      submit: 'افحص الصفحة',
      submitting: 'نفحص…',
      reads: 'يقرأ:',
      rendersIn: 'يعرض الصفحة في:',
      sentOut: {
        'crux-by-country':
          'نرسل أصل موقعك (النطاق مع البروتوكول) إلى Google BigQuery بحساب الخدمة الذي وضعه مشغِّل الخادم، في استعلامين على جداول Chrome UX Report، ولا شيء آخر من صفحتك. تُحاسَب الاستعلامات على مشروعه.',
        'ai-visibility':
          'نرسل إلى كل مساعد لدى الخادم مفتاحه (OpenAI وGemini وPerplexity وClaude) من 3 إلى 5 أسئلة نصية بالعربية تحمل اسم علامتك وموضوع صفحتك وبلدها، مع تفعيل بحثه في الويب. لا نرسل صفحتك ولا بيانات زوارك، ولا نحفظ إجاباتهم.',
        'common-misspellings':
          'نرسل إلى نقطة الاقتراحات العامة لدى جوجل (suggestqueries.google.com) كلماتك الرئيسية بأخطائها الإملائية الشائعة، 12 طلباً على الأكثر، واحداً بعد واحد، باسم ArablyzerBot. وهي نقطة غير موثَّقة للاستعمال الآلي، فلا تعمل إلا إذا فعّلها مشغِّل الخادم.',
        'pdf-forensics':
          'نجلب حتى 3 ملفات PDF مرتبطة بالصفحة، واحداً بعد واحد، باسم ArablyzerBot وبعد أن نقرأ robots.txt لموقع كل ملف؛ وقد يكون بعضها على موقع غير موقعك. تظهر طلباتنا في سجلات ذلك الموقع.',
        'lookalike-domains':
          'نرسل أسماء الدومينات الشبيهة بدومينك (حتى 100 اسم) إلى محلِّل DNS لدى Cloudflare، وأسماء ما سُجِّل منها (12 على الأكثر) إلى crt.sh. لا نفتح أي موقع منها، ولا يخرج شيء آخر من صفحتك.',
        dns: 'نسأل DNS عبر HTTPS لدى Cloudflare، أو لدى المحلِّل الذي ضُبطت عليه الخدمة، عن سجلَّي TXT لنطاق الصفحة: SPF وDMARC. ويصل اسم النطاق إلى ذلك المحلِّل، ولا شيء آخر من الصفحة.',
        search:
          'نرسل إلى بحث الموقع نفسه 12 طلبًا على الأكثر، واحدًا واحدًا وبينها مهلة، باسم ArablyzerBot، وبعد أن نقرأ robots.txt؛ وتظهر في سجلات الموقع، وقد تُحسب في إحصاءات بحثه.',
      },
    },
    result: {
      running: 'نفحص الصفحة…',
      problems: (count) =>
        arabicCount(count, {
          one: 'مشكلة واحدة تحتاج إصلاحاً',
          two: 'مشكلتان تحتاجان إصلاحاً',
          few: '{n} مشكلات تحتاج إصلاحاً',
          many: '{n} مشكلة تحتاج إصلاحاً',
        }),
      notes: (count) =>
        arabicCount(count, {
          one: 'ملاحظة واحدة، وليست مشكلة',
          two: 'ملاحظتان، وليستا مشكلتين',
          few: '{n} ملاحظات، وليست مشكلات',
          many: '{n} ملاحظة، وليست مشكلات',
        }),
      passed: 'الصفحة تجتاز هذا الفحص',
      noneFound: 'لم نجد شيئاً في الصفحة',
      notApplicable: 'لا ينطبق هذا الفحص على الصفحة',
      review: 'فيها ما يحتاج أن تراجعه بنفسك',
      incomplete: 'لم يكتمل الفحص',
      checked: 'ما فحصناه',
      status: {
        pass: 'نجحت',
        fail: 'فشلت',
        'needs-review': 'تحتاج مراجعة',
        'not-applicable': 'لا تنطبق',
        error: 'تعذّر تشغيلها',
      },
      information: { found: 'ملاحظة', none: 'لم تجد شيئاً' },
      rules: (count) =>
        arabicCount(count, {
          one: 'القاعدة:',
          two: 'القاعدتان:',
          few: 'القواعد:',
          many: 'القواعد:',
        }),
      share: 'رابط هذه النتيجة',
      howToFix: 'كيف تُصلح',
      blocked: 'لم نتمكن من فحص الصفحة: ردّ الخادم بخطأ أو منع الفحص.',
      optedOut: 'طلب الموقع ألّا يفحص ArablyzerBot هذه الصفحة.',
      failed: 'تعذّر إكمال الفحص. جرّب بعد قليل.',
      offline: 'تعذّر الوصول إلى خدمة الفحص. تواصل الصفحة المحاولة.',
    },
  },
  en: {
    form: {
      urlLabel: 'Page URL',
      submit: 'Check the page',
      submitting: 'Checking…',
      reads: 'Reads:',
      rendersIn: 'Renders the page in:',
      sentOut: {
        'crux-by-country':
          'We send your site’s origin (the domain with its protocol) to Google BigQuery, with the service account the server’s operator set up, in two queries on the Chrome UX Report tables, and nothing else of your page. The queries are billed to the operator’s project.',
        'ai-visibility':
          'We send each assistant the server has a key for (OpenAI, Gemini, Perplexity and Claude) 3 to 5 text questions in Arabic that carry your brand name, your page’s subject and its country, with its web search on. We send neither your page nor your visitors’ data, and we keep no answer.',
        'common-misspellings':
          'We send Google’s public suggestion endpoint (suggestqueries.google.com) your main words in their common misspellings, 12 requests at most, one at a time, as ArablyzerBot. That endpoint is not documented for automated use, so this runs only if the server’s operator turned it on.',
        'pdf-forensics':
          'We fetch up to 3 PDFs the page links, one at a time, as ArablyzerBot and after reading the robots.txt of each file’s site; some may be on a site that is not yours. Our requests show in that site’s logs.',
        'lookalike-domains':
          'We send the names of the look-alikes of your domain (up to 100) to a DNS resolver at Cloudflare, and the names of the registered ones (12 at most) to crt.sh. We open none of those sites, and nothing else of your page goes out.',
        dns: 'We ask Cloudflare’s DNS over HTTPS, or the resolver the service is set to, for two TXT records of the page’s domain, SPF and DMARC. The domain’s name goes there, and nothing else of the page.',
        search:
          'We send the site’s own search at most 12 requests, one at a time with a pause, as ArablyzerBot, after reading its robots.txt. They show in the site’s logs and may count in its search statistics.',
      },
    },
    result: {
      running: 'Checking the page…',
      problems: (count) => (count === 1 ? '1 problem to fix' : `${String(count)} problems to fix`),
      notes: (count) =>
        count === 1 ? '1 note, not a problem' : `${String(count)} notes, not problems`,
      passed: 'The page passes this check',
      noneFound: 'Nothing found on the page',
      notApplicable: 'This check does not apply to the page',
      review: 'Something here needs your own review',
      incomplete: 'The check did not finish',
      checked: 'What we checked',
      status: {
        pass: 'Passed',
        fail: 'Failed',
        'needs-review': 'Needs review',
        'not-applicable': 'Does not apply',
        error: 'Could not run',
      },
      information: { found: 'Noted', none: 'None found' },
      rules: (count) => englishForm(count, 'Rule:', 'Rules:'),
      share: 'Link to this result',
      howToFix: 'How to fix',
      blocked:
        'We could not check the page: the server answered with an error, or refused the check.',
      optedOut: 'The site asked ArablyzerBot not to check this page.',
      failed: 'The check could not finish. Try again shortly.',
      offline: 'We cannot reach the checking service. The page keeps trying.',
    },
  },
}

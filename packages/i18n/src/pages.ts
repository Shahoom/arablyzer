import type { Copy } from './copy'

/** What the bot's page needs to say of it, each number from the code (apps/web, bot.json). */
export interface BotNumbers {
  readonly pageRedirects: number
  readonly robotsRedirects: number
  readonly robotsKib: number
  readonly requestsPerLoad: number
  readonly mibPerLoad: number
  readonly viewport: { readonly width: number; readonly height: number }
}

/**
 * The site's own pages (M2.4b): the methodology around its document, the bot's page, and the
 * page for an address that has none. `code` in backticks, as in the rules' copy.
 */
export interface PagesStrings {
  readonly methodology: {
    readonly breadcrumb: string
    readonly contents: string
    /** The document's source, in the repository. */
    readonly source: string
  }
  readonly bot: {
    readonly meta: { readonly title: string; readonly description: string }
    readonly breadcrumb: string
    readonly title: string
    readonly intro: string
    readonly contents: string
    readonly identify: {
      readonly title: string
      readonly lead: string
      readonly browsers: string
    }
    readonly when: { readonly title: string; readonly items: readonly string[] }
    readonly fetches: {
      readonly title: string
      readonly items: (numbers: BotNumbers) => readonly string[]
    }
    readonly never: { readonly title: string; readonly items: readonly string[] }
    readonly optOut: {
      readonly title: string
      readonly lead: string
      readonly paths: string
      readonly notes: readonly string[]
    }
  }
  readonly notFound: {
    readonly title: string
    readonly text: string
    readonly links: {
      readonly home: string
      readonly tools: string
      readonly rules: string
      readonly scan: string
    }
  }
}

export const PAGES_UI: Copy<PagesStrings> = {
  reviewed: false,
  ar: {
    methodology: {
      breadcrumb: 'مسار الصفحة',
      contents: 'في هذه الصفحة',
      source: 'مصدر هذه الصفحة في المستودع',
    },
    bot: {
      meta: {
        title: 'ArablyzerBot: بوت Arablyzer، وكيف تمنعه — Arablyzer',
        description:
          'ArablyzerBot يجلب صفحة من موقعك حين يطلب أحد فحصها في Arablyzer. ما يجلبه بالضبط، وما لا يفعله أبداً، وكيف تمنعه بسطرين في robots.txt.',
      },
      breadcrumb: 'مسار الصفحة',
      title: 'ArablyzerBot، بوت Arablyzer',
      intro:
        'البرنامج الذي يجلب صفحة من موقعك حين يطلب أحد فحصها في Arablyzer. هنا ما يفعله بالضبط، وما لا يفعله أبداً، وكيف تمنعه.',
      contents: 'في هذه الصفحة',
      identify: {
        title: 'كيف تعرفه',
        lead: 'كل طلب يرسله خارج المتصفح يحمل هذا الـ User-Agent:',
        browsers:
          'وحين يعرض الصفحة في المتصفحات، يُبقي كل متصفح الـ User-Agent الخاص به ويضيف إليه هذه العلامة في آخره:',
      },
      when: {
        title: 'متى يزور موقعك',
        items: [
          'حين يطلب أحد فحص صفحة من موقعك، في صفحة إحدى الأدوات أو في الفحص الكامل. لا يزور موقعك من تلقاء نفسه، ولا يتبع الروابط إلى صفحات أخرى.',
          'يفحص الصفحة التي طُلبت وحدها: إن كانت تحوّل إلى صفحة أخرى تبعها، ولا يفتح غيرها.',
        ],
      },
      fetches: {
        title: 'ماذا يجلب',
        items: ({
          pageRedirects,
          robotsRedirects,
          robotsKib,
          requestsPerLoad,
          mibPerLoad,
          viewport,
        }) => [
          `ملف robots.txt أولاً، ليعرف هل تمنعه، ويتبع ${String(robotsRedirects)} تحويلات على الأكثر ويقرأ أول ${String(robotsKib)} كيلوبايت منه.`,
          `الصفحة نفسها، ويتبع ${String(pageRedirects)} تحويلات على الأكثر.`,
          `حين يحتاج الفحص إلى عرض الصفحة: يفتحها في Chromium وFirefox وWebKit بنافذة جوال عرضها ${String(viewport.width)} وارتفاعها ${String(viewport.height)}، فيحمّل كل متصفح ما تحمّله الصفحة لزائرها من ملفات CSS وخطوط وصور وسكربتات، بـ ${String(requestsPerLoad)} طلب و${String(mibPerLoad)} ميغابايت على الأكثر في كل متصفح.`,
          'تمرّ كل طلباته عبر بروكسي خروج واحد يرفض العناوين الخاصة والمحلية.',
        ],
      },
      never: {
        title: 'ما لا يفعله أبداً',
        items: [
          'لا يرسل أي نموذج، ولا يكتب في الحقول، ولا يضغط الأزرار.',
          'لا يسجّل الدخول إلى أي حساب.',
          'لا يتجاوز CAPTCHA ولا أي حماية من البوتات: إن ردّ موقعك بتحدٍّ، يقول التقرير إن الموقع منع الفحص.',
        ],
      },
      optOut: {
        title: 'كيف تمنعه',
        lead: 'أضف إلى ملف robots.txt في موقعك مجموعة تسمّيه، فلا يُفحص أي رابط في موقعك:',
        paths: 'أو امنع ما تريد منعه وحده، والباقي يبقى متاحاً للفحص:',
        notes: [
          'يقرأ ArablyzerBot ملف robots.txt في بداية كل فحص، فيسري المنع من الفحص التالي.',
          'إن منعت الصفحة، يتوقف الفحص قبل أن يجلبها، ويقول التقرير إن الموقع طلب ألا يُفحص.',
          'إن حوّلت الصفحة إلى موقع آخر، يقرأ robots.txt ذلك الموقع أيضاً قبل أن يكمل.',
          'مجموعة `User-agent: *` وحدها لا تمنع الفحص الذي يطلبه شخص: هو زيارة صفحة واحدة، لا زحف على موقعك.',
          'إن تعذّرت قراءة robots.txt، كأن يرد بخطأ من الخادم، يكمل الفحص.',
        ],
      },
    },
    notFound: {
      title: 'لا صفحة بهذا الرابط',
      text: 'ربما تغيّر الرابط أو كُتب خطأً. هذه صفحات تجد منها ما تبحث عنه:',
      links: {
        home: 'الصفحة الرئيسية',
        tools: 'كل الأدوات',
        rules: 'مكتبة القواعد',
        scan: 'افحص صفحة',
      },
    },
  },
  en: {
    methodology: {
      breadcrumb: 'Breadcrumb',
      contents: 'On this page',
      source: 'The source of this page, in the repository',
    },
    bot: {
      meta: {
        title: 'ArablyzerBot: Arablyzer’s bot, and how to block it — Arablyzer',
        description:
          'ArablyzerBot fetches a page of your site when someone asks Arablyzer to check it. What it fetches exactly, what it never does, and how to block it with two lines of robots.txt.',
      },
      breadcrumb: 'Breadcrumb',
      title: 'ArablyzerBot, Arablyzer’s bot',
      intro:
        'The program that fetches a page of your site when someone asks Arablyzer to check it. Here is exactly what it does, what it never does, and how to block it.',
      contents: 'On this page',
      identify: {
        title: 'How to recognise it',
        lead: 'Every request it sends outside a browser has this user agent:',
        browsers:
          'When it renders the page in browsers, each browser keeps its own user agent and adds this token at its end:',
      },
      when: {
        title: 'When it visits your site',
        items: [
          'When someone asks to check a page of your site, on a tool’s page or with the full scan. It never visits on its own, and it does not follow links to other pages.',
          'It checks the page asked for alone: if that page redirects, it follows, and opens nothing else.',
        ],
      },
      fetches: {
        title: 'What it fetches',
        items: ({
          pageRedirects,
          robotsRedirects,
          robotsKib,
          requestsPerLoad,
          mibPerLoad,
          viewport,
        }) => [
          `robots.txt first, to know whether you block it, following at most ${String(robotsRedirects)} redirects and reading its first ${String(robotsKib)} KB.`,
          `The page itself, following at most ${String(pageRedirects)} redirects.`,
          `When the check renders the page: it opens it in Chromium, Firefox and WebKit, in a phone window ${String(viewport.width)} wide and ${String(viewport.height)} high, and each browser loads what the page loads for a visitor (stylesheets, fonts, images, scripts), at most ${String(requestsPerLoad)} requests and ${String(mibPerLoad)} MB per browser.`,
          'Every request goes through one egress proxy that refuses private and local addresses.',
        ],
      },
      never: {
        title: 'What it never does',
        items: [
          'It never submits a form, types into a field, or presses a button.',
          'It never logs into an account.',
          'It never gets past a CAPTCHA or any bot protection: if your site answers with a challenge, the report says the site blocked the check.',
        ],
      },
      optOut: {
        title: 'How to block it',
        lead: 'Add a group naming it to your site’s robots.txt, and no address of your site is checked:',
        paths: 'Or block only what you want blocked, and the rest stays open to checks:',
        notes: [
          'ArablyzerBot reads robots.txt at the start of every check, so a block holds from the next check.',
          'When a page is blocked, the check stops before fetching it, and the report says the site asked not to be checked.',
          'When a page redirects to another site, it reads that site’s robots.txt too before going on.',
          'A `User-agent: *` group alone does not block a check someone asks for: that is a visit to one page, not a crawl of your site.',
          'When robots.txt cannot be read, as when it answers with a server error, the check goes on.',
        ],
      },
    },
    notFound: {
      title: 'No page at this address',
      text: 'The address may have changed, or been mistyped. These pages lead to what you are looking for:',
      links: {
        home: 'Home',
        tools: 'All tools',
        rules: 'The rule library',
        scan: 'Check a page',
      },
    },
  },
}

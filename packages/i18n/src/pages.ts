import type { Copy } from './copy'
import { arabicCount, type ArabicForms } from './plural'

/** Redirects a bot follows, as the object of «يتبع»: «تحويلاً واحداً»، «7 تحويلات»، «12 تحويلاً». */
const REDIRECTS: ArabicForms = {
  one: 'تحويلاً واحداً',
  two: 'تحويلين',
  few: '{n} تحويلات',
  many: '{n} تحويلاً',
  other: '{n} تحويل',
}

/** Seconds after a preposition: «بعد ثانية»، «بعد ثانيتين»، «بعد 10 ثوانٍ»، «بعد 12 ثانية». */
const SECONDS: ArabicForms = {
  one: 'ثانية واحدة',
  two: 'ثانيتين',
  few: '{n} ثوانٍ',
  many: '{n} ثانية',
}

/** Hosts after a preposition: «إلى مضيف واحد»، «مضيفين مختلفين»، «3 مضيفين مختلفين»، «50 مضيفاً مختلفاً». */
const HOSTS: ArabicForms = {
  one: 'مضيف واحد',
  two: 'مضيفين مختلفين',
  few: '{n} مضيفين مختلفين',
  many: '{n} مضيفاً مختلفاً',
  other: '{n} مضيف مختلف',
}

/** What the bot's page needs to say of it, each number from the code (apps/web, bot.json). */
export interface BotNumbers {
  readonly pageRedirects: number
  readonly robotsRedirects: number
  readonly robotsKib: number
  readonly sitemaps: number
  readonly sitemapMib: number
  readonly sitemapRedirects: number
  readonly sitemapSeconds: number
  readonly requestsPerLoad: number
  readonly mibPerLoad: number
  /** The distinct hosts a browser may contact in one page load, at most. */
  readonly hostsPerLoad: number
  readonly viewport: { readonly width: number; readonly height: number }
  /** The DNS-over-HTTPS resolver the hosted service asks unless it is configured with another. */
  readonly dohUrl: string
  /** The page's links to its own site that a check asks for, at most. */
  readonly links: number
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
        'البرنامج الذي يجلب صفحتك حين يطلب أحد فحصها: ما يفعله، وما لا يفعله أبداً، وكيف تمنعه.',
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
          'يفحص الصفحة التي طُلبت وحدها: إن كانت تحوّل إلى صفحة أخرى تبعها، ولا يفتح صفحة غيرها.',
        ],
      },
      fetches: {
        title: 'ماذا يجلب',
        items: ({
          pageRedirects,
          robotsRedirects,
          robotsKib,
          sitemaps,
          sitemapMib,
          sitemapRedirects,
          sitemapSeconds,
          requestsPerLoad,
          mibPerLoad,
          hostsPerLoad,
          viewport,
          dohUrl,
          links,
        }) => [
          `ملف robots.txt أولاً، ليعرف هل تمنعه، ويتبع ${String(robotsRedirects)} تحويلات على الأكثر ويقرأ أول ${String(robotsKib)} كيلوبايت منه.`,
          `الصفحة نفسها، ويتبع ${String(pageRedirects)} تحويلات على الأكثر.`,
          `حين يحتاج الفحص إلى سجلات البريد: سؤالان عن سجلات TXT، أحدهما لنطاق الصفحة والآخر للاسم \`_dmarc\` عليه، بأسلوب DNS عبر HTTPS إلى محلِّل Cloudflare (\`${dohUrl}\`) أو إلى المحلِّل الذي ضُبطت عليه الخدمة، عبر بروكسي الخروج نفسه. فيصل اسم النطاق إلى ذلك المحلِّل، ولا شيء آخر من الصفحة.`,
          `حين يحتاج الفحص إلى روابط الصفحة، وهذا في فحص الروابط المعطّلة: طلب \`HEAD\` لكل رابط من أول ${String(links)} رابطاً في الصفحة إلى موقعك نفسه، وطلب \`GET\` إن ردّ بخطأ أو تعذّر الاتصال، دون أن يتبع تحويلاً أو يقرأ محتوى، ودون المسارات التي يمنعها ملف robots.txt عن ArablyzerBot أو عن كل زاحف بالمجموعة \`User-agent: *\`. وبعد أول رد بالحالة \`429\` لا يطلب رابطاً آخر.`,
          `حين يحتاج الفحص إلى خرائط الموقع: أول ${String(sitemaps)} خرائط يسمّيها robots.txt، أو \`/sitemap.xml\` إن لم يسمِّ شيئاً، ويقرأ أول ${String(sitemapMib)} ميغابايت من كل منها ويتبع ${arabicCount(sitemapRedirects, REDIRECTS)} على الأكثر، ولا يفتح الخرائط التي يسردها فهرس خرائط الموقع. ولا ينتظر الشبكة أكثر من ${arabicCount(sitemapSeconds, SECONDS)} للخرائط كلها.`,
          'قد يكون في robots.txt عنوان خريطة على موقع آخر: يقرأ ArablyzerBot ملف robots.txt لذلك الموقع أولاً، ولا يجلب منه ما يطلب ألّا يجلبه ArablyzerBot أو كل الزواحف بمجموعة `User-agent: *`، ولا يتبع تحويلاً إلى موقع آخر إلا حيث يسمح robots.txt فيه.',
          `حين يحتاج الفحص إلى عرض الصفحة: يفتحها في Chromium وFirefox وWebKit بنافذة جوال عرضها ${String(viewport.width)} وارتفاعها ${String(viewport.height)}، فيحمّل كل متصفح ما تحمّله الصفحة لزائرها من ملفات CSS وخطوط وصور وسكربتات، بـ ${String(requestsPerLoad)} طلب و${String(mibPerLoad)} ميغابايت على الأكثر في كل متصفح، ومن ${arabicCount(hostsPerLoad, HOSTS)} على الأكثر.`,
          'تمرّ كل طلباته عبر بروكسي خروج واحد يرفض العناوين الخاصة والمحلية.',
        ],
      },
      never: {
        title: 'ما لا يفعله أبداً',
        items: [
          'لا يرسل أي نموذج، ولا يكتب في الحقول، ولا يضغط الأزرار.',
          'لا يرسل ما تطلب صفحتك أن يرسله: يرفض متصفحه كل طلب غير `GET` و`HEAD`، وكل WebSocket، أياً كانت وجهته، فلا يخرج من الفحص نموذج ولا `sendBeacon` ولا طلب `POST` تصدره صفحتك، حتى إلى موقعك نفسه. وأداة الإحصاء التي تُبلغ عن الزيارة بـ `POST` أو بـ `sendBeacon` لا تُبلغ عن هذه الزيارة.',
          'لا يسجّل الدخول إلى أي حساب.',
          'لا يتجاوز CAPTCHA ولا أي حماية من البوتات: إن ردّ موقعك بتحدٍّ، يقول التقرير إن الموقع منع الفحص، وإن ردّ به على متصفح وحده، يتوقف عرض ذلك المتصفح عندئذ.',
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
          'مجموعة `User-agent: *` وحدها لا تمنع الفحص الذي يطلبه شخص: هو زيارة صفحة واحدة، لا زحف على موقعك. أما الطلبات إلى روابط الصفحة، وهي ليست تلك الزيارة، فتسري عليها هذه المجموعة أيضاً: لا يطلب الفحص مساراً تمنعه.',
          'إن تعذّرت قراءة robots.txt، كأن يرد بخطأ من الخادم، يكمل الفحص.',
        ],
      },
    },
    notFound: {
      title: 'لا صفحة بهذا الرابط',
      text: 'ربما تغيّر الرابط أو كُتب خطأً. ابحث عمّا تريد، أو اختر صفحة:',
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
        'The bot that fetches your page for a check: what it does, what it never does, how to block it.',
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
          'It checks the page asked for alone: if that page redirects, it follows, and opens no other page.',
        ],
      },
      fetches: {
        title: 'What it fetches',
        items: ({
          pageRedirects,
          robotsRedirects,
          robotsKib,
          sitemaps,
          sitemapMib,
          sitemapRedirects,
          sitemapSeconds,
          requestsPerLoad,
          mibPerLoad,
          hostsPerLoad,
          viewport,
          dohUrl,
          links,
        }) => [
          `robots.txt first, to know whether you block it, following at most ${String(robotsRedirects)} redirects and reading its first ${String(robotsKib)} KB.`,
          `The page itself, following at most ${String(pageRedirects)} redirects.`,
          `When the check needs the domain’s mail records: two TXT lookups, one for the page’s domain and one for its \`_dmarc\` name, as DNS over HTTPS to Cloudflare’s resolver (\`${dohUrl}\`) or to the resolver the service is configured with, through the same egress proxy. The domain’s name goes to that resolver, and nothing else of the page.`,
          `When the check needs the page’s links, as the broken-link check does: a \`HEAD\` request to each of the first ${String(links)} links on the page to your own site, and a \`GET\` where it answers an error or the connection fails, following no redirect and reading no content, and skipping the paths robots.txt disallows for ArablyzerBot or for every crawler with \`User-agent: *\`. After the first \`429\` it asks for no more links.`,
          `When the check reads your sitemaps: the first ${String(sitemaps)} your robots.txt names, or \`/sitemap.xml\` when it names none, reading the first ${String(sitemapMib)} MB of each and following at most ${String(sitemapRedirects)} redirects, and never the sitemaps a sitemap index lists. It waits no more than ${String(sitemapSeconds)} seconds on the network for all of them.`,
          'A sitemap your robots.txt names may be on another host: the bot reads that host’s robots.txt first, does not fetch what it asks ArablyzerBot, or every crawler with `User-agent: *`, to leave alone, and follows a redirect to another host only where that host’s robots.txt allows it.',
          `When the check renders the page: it opens it in Chromium, Firefox and WebKit, in a phone window ${String(viewport.width)} wide and ${String(viewport.height)} high, and each browser loads what the page loads for a visitor (stylesheets, fonts, images, scripts), at most ${String(requestsPerLoad)} requests and ${String(mibPerLoad)} MB per browser, to at most ${String(hostsPerLoad)} different hosts.`,
          'Every request goes through one egress proxy that refuses private and local addresses.',
        ],
      },
      never: {
        title: 'What it never does',
        items: [
          'It never submits a form, types into a field, or presses a button.',
          'It sends nothing your page asks it to send: its browsers refuse every request that is not `GET` or `HEAD`, and every WebSocket, wherever it goes, so no form, `sendBeacon` or `POST` request your page makes leaves a check, even to your own site. An analytics tag that reports a visit by `POST` or by `sendBeacon` does not report this one.',
          'It never logs into an account.',
          'It never gets past a CAPTCHA or any bot protection: if your site answers with a challenge, the report says the site blocked the check, and if only a browser is answered with one, that browser’s render stops there.',
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
          'A `User-agent: *` group alone does not block a check someone asks for: that is a visit to one page, not a crawl of your site. The requests for the page’s links are not that visit, and the `*` group applies to them: the check asks for no path it disallows.',
          'When robots.txt cannot be read, as when it answers with a server error, the check goes on.',
        ],
      },
    },
    notFound: {
      title: 'No page at this address',
      text: 'The address may have changed, or been mistyped. Search for what you need, or pick a page:',
      links: {
        home: 'Home',
        tools: 'All tools',
        rules: 'The rule library',
        scan: 'Check a page',
      },
    },
  },
}

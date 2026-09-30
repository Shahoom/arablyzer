# Arablyzer — تصميم المرحلة 0 (الأساس)

> اعتمده المالك في 2026-09-24 بالقيم الافتراضية المقترحة (القسم 6). المرجع: `docs/BUILD-PLAN.md` §17.
> المصطلحات التقنية وأسماء الملفات بالإنجليزية عمداً، كما في الخطة.

## النطاق

حسب §17: المستودع، CI، مخطط التقرير، خادم fixtures، `packages/tools` و`seo`، أول 10 قواعد،
`npx arablyzer --json`.

**تُقبل المرحلة عندما:** تنجح fixtures كل قاعدة، ويكون JSON صالحاً حسب المخطط.

**القرار الأساسي: المرحلة 0 بلا متصفح.** القواعد العشر تعمل على استجابة HTTP وHTML الخام وrobots.txt،
فلا يحتاج الـ CLI تنزيل Playwright ويبقى الـ CI سريعاً. الـ collectors داخل المتصفح (Playwright) تأتي في
المرحلة 1 وتتصل بنفس عقد `needs`/`Evidence` في §10.

---

## 1. بنية المستودع (pnpm + Turborepo)

```
arablyzer/
├─ packages/
│  ├─ report-schema/  مصدر الحقيقة بـ Zod → أنواع TS + report.schema.json مولّد (في git، والـ CI يتحقق من تطابقه)
│  ├─ egress/   جديد  حارس SSRF؛ الكود الوحيد المسموح له بفتح اتصال شبكة
│  ├─ collectors/     من البايتات إلى الحقائق، بلا شبكة: http · html · text · robots
│  ├─ rules/          مجلد لكل قاعدة + أدوات نقية (مطابق robots.txt، كشف الخط، قوائم رموز ISO)
│  ├─ engine/   جديد  رابط ← تقرير؛ يستخدمه الـ CLI والفحص الذاتي، ولاحقاً العامل
│  ├─ tools/          مخطط تعريف الأداة + 3 أدوات نموذجية (rtl-check، whatsapp-link-check، ai-crawler-check)
│  ├─ seo/            بناة meta/canonical/hreflang/JSON-LD + الفحص الذاتي لقالب §6.1
│  └─ cli/            أمر `arablyzer` (الحزمة الوحيدة التي ستُنشر يوماً)
├─ fixtures/          خادم fixtures + fixtures مشتركة (أهداف SSRF، صفحات SEO)
└─ docs/
```

**حزمتان ليستا في §9** (أُقرّتا): `egress` يجمع كل الوصول للشبكة خلف باب واحد مفحوص، و`engine` هو
خط الفحص الذي يحتاجه الـ CLI والفحص الذاتي والعامل.

**لا تُنشأ الآن:** `apps/*`، `scoring` (المرحلة 1)، `i18n` و`infra` (المرحلة 2)، `plans` (المرحلة 4)، `ai`.

### egress
- http(s) فقط، ≤ 2048 حرفاً، المنفذان 80 و443 فقط، ولا بيانات دخول داخل الرابط.
- يحل DNS ويرفض الرابط إذا كان **أي** عنوان ناتج غير قابل للوصول العام: كل ما تصنّفه سجلات IANA
  للأغراض الخاصة (الشبكات الخاصة، loopback، link-local وخدمات metadata، CGNAT، IPv6 الخاصة، وIPv4
  المخبّأ داخل IPv6: mapped وNAT64 و6to4)، إضافة إلى عنوان IP العام للخادم نفسه ونطاقات من الإعدادات.
- يتصل فقط بالعنوان الذي فحصه، فلا يستطيع DNS rebinding تبديله.
- يتبع التحويلات بنفسه ويعيد فحص كل خطوة (≤ 10). الحدود: 30 ث و25MB بعد فك الضغط.
- وضع مباشر في الـ CLI الآن؛ وضع البروكسي (Smokescreen) في المرحلة 2.
- ESLint يمنع `fetch` و`http` و`net` و`dns` و`undici` في كل مكان آخر.
- `--allow-private` (للبناءات المحلية) يفتح الشبكات الخاصة وloopback والمنافذ الأخرى، **ولا يفتح أبداً**
  link-local أو عناوين metadata.

### collectors
- `http`: الحالة، الترويسات كما وصلت (مع التكرار)، سلسلة التحويلات.
- `html`: تحليل بـ parse5، أي نفس الشجرة التي يبنيها المتصفح.
- `text`: النص المرئي وعدّ الحروف العربية واللاتينية؛ كشف الترميز حسب معيار WHATWG بما فيه
  صفحات `windows-1256` القديمة.
- `robots`: تحليل robots.txt حسب RFC 9309، حتى 500 KiB.

### rules
- واجهة `Rule` كما في §10 تماماً.
- كل قاعدة مجلد `rules/<id>/` فيه `rule.ts` و`rule.test.ts` و`copy.ar.md` و`copy.en.md` و`fixtures/`.
- الـ detectors تعيد بيانات فقط (المكان والقيم)؛ الصياغة تأتي من قوالب النصوص.
- ملفات النصوص هي محتوى صفحة مكتبة القواعد: لماذا يهم، كيف تُصلح، كيف نكشف، المراجع. يعرضها Astro في
  المرحلة 2.

### engine
يجلب فقط ما تحتاجه القواعد المختارة (الصفحة، robots.txt)، ثم collectors ← `appliesTo` ← `detect`.
ترتيب المخرجات ثابت دائماً.

### fixtures
كل موقع fixture مجلد ثابت، مع `fixture.json` اختياري يحدد الحالة والترويسات والتحويلات لكل مسار.
كل موقع على منفذ محلي خاص به حتى يكون robots.txt في الجذر:

```
rules/robots-blocks-googlebot/fixtures/
  wrong/      robots.txt: "User-agent: *" / "Disallow: /"
  wrong-503/  fixture.json: { "/robots.txt": { "status": 503 } }
  right/      robots.txt: "Disallow: /admin/"
  right-404/  بلا robots.txt (404 = مسموح بالكامل حسب RFC 9309)
```

---

## 2. أول 10 قواعد

تغذّي 10 من أدوات الـ MVP الأربعين وتغطي 8 من الفئات الخمس عشرة، والقواعد 1–4 هي الطبقة العربية.
أدوات الـ MVP الخفيفة يجب أن تعمل بلا متصفح، لذا تتقاطع القواعد 1 و5 و6 و8 و9 مع بعض فحوص
axe/Lighthouse؛ في المرحلة 1 تُربط تلك الفحوص بمعرّفات قواعدنا فلا يُبلَّغ عن شيء مرتين.

| # | المعرّف · الفئة · الخطورة | تُطلق عندما | ✗ fixture خطأ | ✓ fixture صحيح |
|---|---|---|---|---|
| 1 | `ar-html-lang` · intl · serious (WCAG 3.1.1) | أغلب حروف النص بالخط العربي، لكن `<html lang>` غائب أو لغة لا تُكتب بالخط العربي | `lang="en"` على مقال عربي، ونسخة بترميز windows-1256 | `lang="ar"`؛ وصفحة فارسية `lang="fa"` تنجح أيضاً |
| 2 | `rtl-html-dir` · rtl · serious | الصفحة عربية في أغلبها لكن `<html>` بلا `dir="rtl"` (توصية W3C ومواصفة HTML: السمة لا CSS) | `lang="ar"` والاتجاه في CSS فقط | `<html lang="ar" dir="rtl">` |
| 3 | `ar-latin-punctuation` · ar-content · minor | علامة لاتينية `? , ;` مباشرة بعد حرف عربي | «هل تريد المساعدة? تواصل معنا, نحن هنا» | `؟ ، ؛`؛ و`1,500` و`React, Vue` لا تُطلقان |
| 4 | `whatsapp-link-format` · forms · serious | رقم رابط wa.me أو api.whatsapp.com ليس بالصيغة الدولية الكاملة أرقاماً فقط | `wa.me/+968 9123-4567`، `wa.me/0501234567`، `wa.me/٩٦٨٩١٢٣٤٥٦٧` | `wa.me/96891234567?text=…` برسالة عربية مشفّرة |
| 5 | `hreflang-invalid-code` · intl · moderate | قيمة hreflang ليست ISO 639-1 مع منطقة ISO 3166-1 alpha-2 اختيارية، أو `x-default` | `ar-KSA`، `ar_AE`، `en-UK` | `ar-SA`، `ar-AE`، `en-GB`، `x-default` |
| 6 | `robots-blocks-googlebot` · crawl · critical | robots.txt يمنع Googlebot من الرابط النهائي؛ و5xx أو تعذّر الوصول = منع كامل (RFC 9309) | `Disallow: /`؛ robots.txt يعيد 503 | `Disallow: /admin/`؛ robots.txt يعيد 404 |
| 7 | `robots-blocks-ai-search` · ai · moderate | robots.txt يمنع زاحف **بحث** بالذكاء الاصطناعي (مثل OAI-SearchBot وPerplexityBot وClaude-SearchBot) | `User-agent: OAI-SearchBot` / `Disallow: /` | يمنع GPTBot فقط (زاحف تدريب: معلومة لا مخالفة) |
| 8 | `page-noindex` · index · critical | `noindex` أو `none` في meta robots/googlebot أو في ترويسة `X-Robots-Tag` (بما فيها `googlebot:`) | `X-Robots-Tag: noindex`؛ ونسخة بوسم meta | `max-image-preview:large` فقط |
| 9 | `canonical-conflict` · index · serious | الصفحة تعطي أكثر من رابط canonical مختلف (عدة وسوم، أو الوسم يخالف ترويسة `Link`) | وسما `rel=canonical` برابطين مختلفين | canonical واحد مطلق؛ الترويسة والوسم متفقان |
| 10 | `jsonld-syntax-error` · schema · serious | كتلة `application/ld+json` ليست JSON صالحاً | فاصلة زائدة، أو `"` غير مهرّبة داخل `name` عربي | LocalBusiness صالح باسم عربي |

- **فحوص إضافية في الـ CI:** كل fixture خطأ يُطلق قاعدته وحدها، وكل fixture صحيح يجتاز القواعد العشر
  كلها، فتصلح أمثلةً نظيفة لصفحات القواعد. الـ fixtures الصحيحة تتضمن حالات قريبة (مثل `1,500`)
  لاصطياد الإيجابيات الكاذبة.
- **ترتيب العمل لكل قاعدة (commit واحد لكل قاعدة):** fixture الخطأ واختبار فاشل، ثم fixture الصحيح،
  ثم الـ detector، ثم النص العربي، ثم الإنجليزي.
- **المعرّفات ثابتة للأبد (§10).**

---

## 3. مخطط التقرير ومخرجات الـ CLI

```
arablyzer <url> [--json] [--lang ar|en] [--rules id,…] [--fail-on <severity>] [--timeout 30] [--allow-private]
```

- مع `--json` يحمل stdout تقرير JSON وحده؛ رسائل السجل إلى stderr.
- لغة المخرجات النصية تتبع لغة النظام (`LANG`). طرفيات كثيرة لا تعرض النص من اليمين لليسار فيظهر العربي
  معكوساً؛ `--lang` يتجاوز ذلك.
- **رموز الخروج:** `0` اكتمل؛ `1` مخالفات عند `--fail-on` أو أعلى؛ `2` لم يكتمل (رابط محجوب أو غير قابل
  للوصول، مهلة، فحص جزئي).
- قبل الموافقة على النشر يعمل من المستودع: `pnpm arablyzer <url> --json`.

مثال توضيحي (القيم للشرح فقط):

```jsonc
{
  "schemaVersion": "0.1.0",
  "generator": { "name": "arablyzer", "version": "0.1.0", "rulesetVersion": "0.1.0" },
  "target": {
    "url": "http://example.com", "finalUrl": "https://example.com/", "fetchedAt": "…",
    "userAgent": "ArablyzerBot/1.0 (+https://arablyzer.com/bot)",
    "http": { "status": 200, "contentType": "text/html; charset=utf-8",
              "redirects": [{ "url": "http://example.com/", "status": 301 }] }
  },
  "scan": { "status": "complete", "durationMs": 0, "notices": [] },   // complete | partial | failed
  "page": { "lang": "en", "dir": null, "dominantScript": "arabic" },
  "summary": { "pass": 8, "fail": 1, "needsReview": 0, "notApplicable": 1, "error": 0,
               "bySeverity": { "critical": 0, "serious": 1, "moderate": 0, "minor": 0, "info": 0 } },
  "rules": [{ "id": "ar-html-lang", "version": "1.0.0", "category": "intl", "severity": "serious",
              "wcag": ["3.1.1"], "status": "fail", "title": { "ar": "…", "en": "…" } }],
  "findings": [{
    "ruleId": "ar-html-lang", "severity": "serious", "fingerprint": "…",
    "message": { "ar": "…", "en": "Content is mostly Arabic, but <html lang=\"en\">" },
    "evidence": { "url": "https://example.com/", "selector": "html",
                  "snippet": "<html lang=\"en\">", "values": { "declaredLang": "en" } }
  }],
  "facts": { "robots": { "status": 200,
             "aiCrawlers": [{ "token": "GPTBot", "purpose": "training", "allowed": false }] } }
}
```

- **حالة القاعدة:** `pass` أو `fail` أو `needs-review` (`manualCheck` في §10، لا تُخصم) أو `not-applicable`
  أو `error`. لا تنجح قاعدة بصمت إذا تعذّر جمع بياناتها: تصبح `error` والفحص `partial`.
- **نفس الصفحة = نفس المخرجات:** الترتيب ثابت، ولا يتغير بين تشغيلين إلا `fetchedAt` و`durationMs`.
- **بيانات القاعدة مرة واحدة** في `rules[]` ولا تتكرر في كل مخالفة؛ هذا يقابل SARIF مباشرة (المحوّل في
  المرحلة 1).
- **`fingerprint`**: hash للقاعدة والمكان، لإزالة التكرار ومقارنة «ما الذي تغيّر» لاحقاً بلا تغيير في المخطط.
- **`facts`**: ملخصات صغيرة تعرضها صفحات الأدوات، مثل جدول زواحف الذكاء الاصطناعي.
- **الدرجة** تأتي في المرحلة 1 كرفع minor لإصدار المخطط.

---

## 4. الـ CI (GitHub Actions، كل PR وعلى main)

1. **التثبيت:** Node 22 و24، إصدار pnpm من `packageManager`، `--frozen-lockfile`.
2. **Lint:** ESLint (typescript-eslint strict) وPrettier، مع منع كود الشبكة خارج `egress`.
3. **Typecheck:** `tsc --noEmit` بإعدادات strict و`noUncheckedIndexedAccess`.
4. **اختبارات القواعد:** لكل قاعدة: fixture الخطأ يُطلقها والصحيح لا، والفحوص الإضافية في القسم 2،
   واكتمال القاعدة: الـ fixtures موجودة، النص العربي والإنجليزي بكل أقسامه، المعرّف والإصدار والفئة صالحة،
   والنص العربي معلَّم كمراجَع.
5. **اختبارات SSRF:** جدول روابط هجومية:
   - صيغ IP متنكّرة: `0x7f.1`، `2130706433`، `0177.0.0.1`، `127.1`.
   - IPv6 خاصة وIPv4 مخبّأ في IPv6: `[::1]`، `[::ffff:169.254.169.254]`، NAT64 و6to4.
   - حيل مثل `user@host` و`localhost.`.
   - أسماء تُحل إلى عناوين خاصة (resolver مزيّف).
   - DNS rebinding: عنوان عام أولاً ثم خاص؛ الاتصال يبقى على العنوان المفحوص.
   - تحويلات إلى عناوين خاصة أو metadata في منتصف السلسلة.
   - منافذ وبروتوكولات أخرى، واستجابات كبيرة أو بطيئة.
6. **e2e:** بناء الـ CLI، وفحص كل موقع fixture عبر HTTP بـ `--json`، والتحقق من المخرجات مقابل
   `report.schema.json` بـ Ajv (مدقق مستقل عن Zod).
7. **فحص SEO الذاتي:**
   - محتوى الأدوات والقواعد كامل بالعربية والإنجليزية؛ الـ slugs بـ ASCII وفريدة؛ الروابط الداخلية تعمل.
   - الـ `<head>` المولّد فيه canonical وhreflang متبادل (ar، en، x-default ← ar) وJSON-LD من نوعي
     WebApplication وBreadcrumbList بسعر 0، ويجتاز قواعدنا نفسها.
   - صفحات الأدوات قابلة للأرشفة، وقالب التقرير `noindex`.
   - للفاحص نفسه fixtures صفحات خطأ/صحيح؛ في المرحلة 2 يعمل على الموقع المبني في `dist/` من Astro.
8. **انحراف المخطط:** إعادة توليد `report.schema.json` والفشل إن اختلف عن النسخة المحفوظة.

لا صور Docker ولا نشر ولا اختبارات واجهة في المرحلة 0.

**ثلاثة PRs:**
- **M0.1:** مساحة العمل، الـ CI، `report-schema`، `egress` مع اختبارات SSRF، خادم fixtures.
- **M0.2:** `collectors`، القواعد العشر، `engine`، الـ CLI.
- **M0.3:** `tools`، `seo`، الفحص الذاتي.

---

## 5. المخاطر

- **حتى المرحلة 1 يُحلَّل HTML الخام فقط.** في الصفحات التي يبني JavaScript نصها ستظهر قواعد النص
  «غير منطبقة». سيضيف الفحص تنبيهاً عندما يكون HTML الخام قليل النص كثير السكربتات.
- **الخط العربي ليس دائماً اللغة العربية.** الفارسية والأردية بنفس الخط، لذا تقبل القاعدة 1 أي رمز لغة
  يُكتب بالخط العربي.
- **قد تعامل المواقع زاحفنا بخلاف Googlebot.** جدار الحماية قد يجيب ArablyzerBot بشكل مختلف. مخالفات
  robots تذكر ما استلمناه **نحن**. لا ننتحل Googlebot أبداً لأن ذلك تجاوز لحماية البوتات.
- **معرّفات القواعد لا تتغير بعد نشرها (§10).**
- **أسماء زواحف الذكاء الاصطناعي تتغير.** تُحفظ كبيانات، ولكل اسم رابط توثيق المزوّد وتاريخ آخر تحقق.
- **حماية SSRF مختبرة جزئياً في المرحلة 0.** نختبر الحارس الداخلي الآن؛ Smokescreen يُركَّب في المرحلة 2
  ويُختبر بنفس قائمة الروابط الهجومية. وعندما يبدأ الـ CLI تشغيل متصفح في المرحلة 1 تمر حركة المتصفح
  عبر بروكسي محلي مبني على `egress`.

---

## 6. القرارات (2026-09-24)

| # | الموضوع | ما اعتُمد |
|---|---|---|
| 1 | الترخيص (§20.2) | AGPL-3.0 لكامل المستودع |
| 2 | الاسم والنشر (§20.1) | لا يُنشر شيء؛ الـ User-Agent كما في الخطة؛ الفحص على الـ fixtures والمواقع التي يسمّيها المالك فقط. الاسمان `arablyzer` و`arabalyzer` كانا متاحين على npm في 2026-09-24؛ يُحجزان مع قرار النطاق |
| 3 | المستودع والـ PRs | مستودع GitHub خاص الآن، عام بعد تسجيل النطاق؛ أول commit على main = `CLAUDE.md` و`docs/BUILD-PLAN.md` كما هما؛ العمل على فروع `phase-0/*` |
| 4 | الـ CLI وقاعدة بروكسي الخروج | نفس قواعد المنع داخل العملية افتراضياً؛ `--allow-private` للبناءات المحلية؛ العمّال عبر Smokescreen في المرحلة 2 |
| 5 | حزمتا `egress` و`engine` | تُضافان |
| 6 | متصفح في المرحلة 0 | لا |
| 7 | صفحة مكتبة القواعد والمراجعة العربية | في المرحلة 0 = ملفات النصوص مجتازةً فحوص المحتوى؛ المالك يراجع النص العربي في كل PR، والـ CI يُبقي القاعدة حمراء حتى يُعلَّم `copy.ar.md` كمراجَع |
| 8 | Node | الـ CLI يدعم 22 فما فوق؛ الـ CI يختبر 22 و24؛ صور Docker من المرحلة 1 على 24 |
| 9 | مواقع اختبار حقيقية | **معلّق:** ينتظر أن يسمّي المالك 3–5 مواقع قبل دمج M0.2 |

**ملاحظة:** §15 يذكر VPS مخصّصاً، بينما يسجّل `CLAUDE.md` التشغيل على الخادم الحالي المشترك بميزانية
3.5GB. يُوحَّد §15 و§20.5 مع `CLAUDE.md` عند الوصول إلى المرحلة 2 ما لم يقرر المالك غير ذلك.

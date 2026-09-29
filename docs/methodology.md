# منهجية Arablyzer

كيف يفحص Arablyzer صفحة، وكيف يحسب درجتها، وما حدود كل مصدر يعتمد عليه.

## ماذا يفعل الفحص

1. **يجلب الصفحة** عبر بروكسي خروج واحد يرفض العناوين الخاصة وعناوين الخادم نفسه، ويتبع التحويلات حتى عشرة، ويقرأ الصفحة وملف robots.txt.
2. **يقرأ HTML الصفحة** كما وصل، قبل أي سكربت: العنوان والوصف واللغة والاتجاه والروابط والبيانات المنظّمة والنماذج.
3. **يعرض الصفحة في المتصفحات** إذا طُلب ذلك: Chromium وFirefox، وWebKit في الخوادم ذات الشبكة المعزولة. في كل محرّك يقيس النص العربي والاتجاه والخطوط وحقول النماذج، ويشغّل مجموعة مختارة من قواعد axe-core للوصولية، ويقرأ ملفات CSS والخطوط التي حمّلها المتصفح.
4. **يشغّل القواعد**: كل قاعدة دالة ثابتة تقرأ ما جُمع ولا تجلب شيئاً، فالصفحة نفسها تعطي النتيجة نفسها في كل مرة.

## نتيجة كل قاعدة

| الحالة | المعنى |
|---|---|
| نجحت | في الصفحة ما تفحصه القاعدة، ولم تجد مشكلة |
| فشلت | وجدت مشكلة واحدة على الأقل، ويذكر التقرير مكانها ودليلها |
| تحتاج مراجعة | ما وجدته يحتاج نظر إنسان، كنص فوق صورة لا يُقاس تباينه؛ لا تُخصم |
| لا تنطبق | ليس في الصفحة ما تفحصه، كقاعدة الصور في صفحة بلا صور |
| تعذّر تشغيلها | لم تكتمل، كأن ينتهي وقت العرض، أو تتعذّر قراءة الملفات التي حمّلتها الصفحة؛ تُخرج من الدرجة وتجعلها جزئية |

## الدرجة

لكل قاعدة خطورة، ولكل خطورة وزن:

| الخطورة | الوزن |
|---|---|
| حرِج | 10 |
| خطير | 5 |
| متوسط | 3 |
| بسيط | 1 |
| معلومة | 0 |

الدرجة = 100 × (1 − مجموع أوزان القواعد الفاشلة ÷ مجموع أوزان القواعد المنطبقة)، مقرّبة إلى أقرب عدد صحيح.

- **المنطبقة** هي التي نجحت أو فشلت. التي لا تنطبق، والتي تحتاج مراجعة، والتي تعذّر تشغيلها، لا تدخل الحساب.
- **الدرجة العامة** بالصيغة نفسها على كل القواعد، و**درجة كل فئة** على قواعدها وحدها، فالفئة ذات القواعد الأثقل تؤثر في الدرجة العامة أكثر. لكل فئة شغّل الفحص قواعدها درجة، أو «بلا درجة» إن لم تنطبق منها قاعدة ذات وزن.
- **الدرجة الجزئية**: إذا تعذّر تشغيل قاعدة، يقول التقرير إن الدرجة جزئية، لأنها تحسب ما اكتمل فقط.
- **بلا درجة**: إذا لم تنطبق أي قاعدة ذات وزن، كفئة قواعدها كلها معلومات، فلا درجة لها.
- **القواعد المحسوبة**: يذكر التقرير كم قاعدة شغّلها الفحص من قواعد المجموعة كلها (`score.rules`). الفحص دون عرض الصفحة في متصفح يترك القواعد التي تقرأ الصفحة المعروضة، والفحص الذي يسمّي قواعده يشغّلها وحدها، فتُحسب درجته على قواعد أقل.
- **المقارنة**: الدرجات تُقارن داخل الإصدار الرئيسي نفسه لمجموعة القواعد فقط، ويذكره التقرير (`rulesetVersion`)، لأن إضافة قاعدة أو تغيير وزن يغيّر الدرجة؛ وبين فحوص شغّلت القواعد نفسها.

### مثال لكل وزن

في صفحة نجحت فيها قاعدة حرجة (10) وقاعدة خطيرة (5)، وفشلت قاعدة واحدة:

| الخطورة الفاشلة | المنطبق | الفاشل | الدرجة |
|---|---|---|---|
| حرِج | `10 + 5 + 10 = 25` | `10` | `100 × (1 − 10 ÷ 25) = 60` |
| خطير | `10 + 5 + 5 = 20` | `5` | `100 × (1 − 5 ÷ 20) = 75` |
| متوسط | `10 + 5 + 3 = 18` | `3` | `100 × (1 − 3 ÷ 18) = 83.3`، أي `83` |
| بسيط | `10 + 5 + 1 = 16` | `1` | `100 × (1 − 1 ÷ 16) = 93.75`، أي `94` |
| معلومة | `10 + 5 + 0 = 15` | `0` | `100` |

والأمثلة نفسها اختبارات في `packages/scoring`، فلا تختلف الصيغة المكتوبة هنا عن المحسوبة.

## حدود كل مصدر

- **HTML الصفحة كما وصل**: لا يرى ما تضيفه السكربتات بعد التحميل. القواعد التي تحتاجه تقرأ الصفحة المعروضة.
- **المتصفحات**: كل محرّك بإصدار ثابت يذكره التقرير، وبنافذة جوال واحدة (390 × 844)، ولغة ومنطقة زمنية ثابتة، وسياسة انتظار واحدة. **WebKit على Linux ليس Safari**: هو محرّكه نفسه، لكن خطوط النظام وطريقة الرسم تختلف.
- **الخطوط**: الخطوط الاحتياطية تختلف بين الأجهزة، فما يرسمه خادمنا حين ينقص خط الموقع قد يخالف جهاز الزائر. لذلك تُبنى صورة Docker بخطوط محددة، والتقارير المرجعية تُولَّد داخلها.
- **ملفات CSS والخطوط**: لا نقرأ ملفاً إلا إذا عرفنا حجمه قبل قراءته، وضمن حدود ثابتة. Firefox وWebKit يخفيان حجم ملف CSS من موقع آخر، فلا نقرؤه فيهما، والقواعد التي تحتاجه لا تحكم عليه.
- **axe-core**: مجموعة مختارة من قواعده، لكل منها نص عربي ونماذج اختبار. ويتجاهل axe تباين النص العربي بسبب خلل فيه، فنصلحه قبل تشغيله.
- **حدود القواعد نفسها**: كل حد رقمي في قاعدة، كعدد الأيام قبل انتهاء الشهادة أو حجم التوفير بالضغط، مذكور في صفحة القاعدة مع مصدره.
- **بيانات الزوار الحقيقيين (CrUX)**: من تقرير تجربة مستخدمي Chrome، بمفتاح API: الشريحة المئوية 75 لكل مقياس على الجوال في آخر 28 يوماً، لرابط الصفحة، أو لموقعها كله حين لا تكون عنده بيانات عنها، ويقول التقرير أيهما. هي زيارات Chrome وحدها، لمن يشاركون إحصاءات الاستخدام ويزامنون سجل التصفح؛ ولا تُحسب زيارات Chrome على iPhone ولا المتصفحات الأخرى. وكثير من المواقع قليلة الزيارات ليس عند CrUX بيانات عنها، فلا تنطبق قواعدها. ويُرسَل رابط الصفحة إلى Google، إلا صفحة على عنوان محلي أو خاص.
- **Lighthouse**: الإصدار 13 في متصفح العرض نفسه (Chromium بلا واجهة من Playwright)، على جوال يحاكيه وبسرعة شبكة ومعالج محسوبة (simulated throttling)، ومقاييسه الخمسة التي تزن درجته. تتغير من تشغيل لآخر، فتظهر معلومةً لا تكون مخالفة ولا تدخل الدرجة أبداً.

---

# Arablyzer methodology

How Arablyzer scans a page, how it scores it, and the limits of each source it relies on.

## What a scan does

1. **Fetches the page** through a single egress proxy that refuses private addresses and the server's own, follows up to ten redirects, and reads the page and robots.txt.
2. **Reads the page's HTML** as it arrived, before any script: title, description, language, direction, links, structured data and forms.
3. **Renders the page in browsers** when asked: Chromium and Firefox, and WebKit on servers with an isolated network. In each engine it measures Arabic text, direction, fonts and form fields, runs a curated set of axe-core's accessibility rules, and reads the stylesheets and fonts the browser loaded.
4. **Runs the rules**: each is a fixed function that reads what was collected and fetches nothing, so the same page gives the same result every time.

## Each rule's result

| Status | Meaning |
|---|---|
| Passed | The page has what the rule checks, and it found no problem |
| Failed | It found at least one problem; the report says where, with evidence |
| Needs review | What it found needs a person's eye, such as text over an image whose contrast cannot be measured; never deducted |
| Not applicable | The page has nothing the rule checks, such as the image rule on a page without images |
| Could not run | It did not finish, such as when rendering ran out of time, or the files the page loaded could not be read; left out of the score, which becomes partial |

## The score

Each rule has a severity, and each severity a weight: critical 10, serious 5, moderate 3, minor 1, information 0.

Score = 100 × (1 − total weight of failed rules ÷ total weight of applicable rules), rounded to the nearest whole number.

- **Applicable** rules are those that passed or failed. Rules that do not apply, need review, or could not run are left out.
- **The overall score** uses the same formula over every rule, and **each category's score** over its own rules, so categories with heavier rules weigh more in the overall score. Every category the scan ran rules of has a score, or "no score" when none of its rules with weight applied.
- **A partial score**: when a rule could not run, the report says the score is partial, since it counts only what finished.
- **No score**: when no rule with weight applies, such as a category of information rules alone, there is no score.
- **The rules counted**: the report gives how many of the rule set's rules the scan ran (`score.rules`). A scan that does not render the page in a browser leaves out the rules that read the rendered page, and a scan that names its rules runs those alone, so its score counts fewer rules.
- **Comparing**: scores compare only within the same major version of the rule set, which the report gives (`rulesetVersion`), since adding a rule or changing a weight changes the score; and between scans that ran the same rules.

### An example for each weight

On a page where a critical rule (10) and a serious rule (5) passed, and one rule failed:

| Failed severity | Applicable | Failed | Score |
|---|---|---|---|
| Critical | 10 + 5 + 10 = 25 | 10 | 100 × (1 − 10 ÷ 25) = 60 |
| Serious | 10 + 5 + 5 = 20 | 5 | 100 × (1 − 5 ÷ 20) = 75 |
| Moderate | 10 + 5 + 3 = 18 | 3 | 100 × (1 − 3 ÷ 18) = 83.3, so 83 |
| Minor | 10 + 5 + 1 = 16 | 1 | 100 × (1 − 1 ÷ 16) = 93.75, so 94 |
| Information | 10 + 5 + 0 = 15 | 0 | 100 |

The same examples are tests in `packages/scoring`, so the formula written here and the one computed cannot differ.

## The limits of each source

- **The page's HTML as it arrived**: it does not see what scripts add after loading. The rules that need that read the rendered page.
- **Browsers**: each engine at a fixed version the report gives, with one phone-sized window (390 × 844), a fixed language and time zone, and one waiting policy. **WebKit on Linux is not Safari**: it is Safari's engine, but system fonts and drawing differ.
- **Fonts**: fallback fonts differ between devices, so what our server draws when a site's font lacks a character may differ from a visitor's device. So the Docker image is built with set fonts, and reference reports are generated inside it.
- **Stylesheets and fonts**: a file is read only when its size is known before reading it, within fixed limits. Firefox and WebKit hide the size of another site's stylesheet, so there it is not read, and the rules that need it do not judge it.
- **axe-core**: a curated set of its rules, each with Arabic copy and test fixtures. A bug makes axe skip the contrast of Arabic text; we correct for it before running it.
- **The rules' own limits**: every number in a rule, such as the days before a certificate expires or the savings compression must bring, is on the rule's page with its source.
- **Real-user data (CrUX)**: from the Chrome UX Report, with an API key: each metric's 75th percentile on phones over the last 28 days, for the page's URL, or its whole site when CrUX has none for the page, and the report says which. It counts visits in Chrome alone, by users who share usage statistics and sync their browsing history; Chrome on iPhone and other browsers are not counted. Many sites with fewer visits have no data, so its rules do not apply to them. The page's URL is sent to Google, unless the page is on a local or private address.
- **Lighthouse**: version 13 in the render's own browser (Playwright's headless Chromium), on an emulated phone with simulated throttling, and the five metrics its score weighs. They vary from run to run, so they show as information: never findings, and never part of the score.

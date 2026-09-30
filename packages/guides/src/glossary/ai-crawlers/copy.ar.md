---
reviewed: false
---

# زواحف الذكاء الاصطناعي (AI crawlers)

زواحف الذكاء الاصطناعي برامج تجمع صفحات الويب لشركات مثل OpenAI وAnthropic وPerplexity، بعضها لتدريب النماذج، وبعضها للبحث، وبعضها لطلبات المستخدمين.

## التعريف

لكل زاحف اسمه في robots.txt، فتستطيع أن تسمح لبعضها وتمنع بعضها:

| الزاحف | الشركة | الغرض |
| --- | --- | --- |
| `GPTBot` | OpenAI | محتوى قد يُستخدم في تدريب نماذجها |
| `OAI-SearchBot` | OpenAI | نتائج البحث في ChatGPT |
| `ChatGPT-User` | OpenAI | زيارة صفحة حين يطلب مستخدم |
| `ClaudeBot` | Anthropic | محتوى قد يُستخدم في تدريب نماذجها |
| `Claude-SearchBot` | Anthropic | نتائج البحث لمستخدميها |
| `Claude-User` | Anthropic | زيارة صفحة حين يطلب مستخدم |
| `PerplexityBot` | Perplexity | نتائج بحث Perplexity، لا التدريب |
| `Perplexity-User` | Perplexity | زيارة صفحة حين يطلب مستخدم |

أما `Google-Extended` فليس زاحفاً، بل اسم في robots.txt تقرر به هل يستعمل Google محتواك في تدريب نماذج Gemini وفي تحديد المصادر (grounding)، ولا أثر له في بحث Google.

## لماذا يهم

- منع التدريب غير منع البحث: توثّق OpenAI أن المواقع التي تمنع `OAI-SearchBot` لا تظهر في إجابات بحث ChatGPT إلا روابطَ تنقّل، وأن كل إعداد مستقل عن الآخر، فتستطيع أن تسمح للزاحف `OAI-SearchBot` وتمنع `GPTBot`.
- زواحف المستخدمين تختلف: تقول OpenAI إن robots.txt قد لا ينطبق على `ChatGPT-User`، وتقول Perplexity إن `Perplexity-User` يتجاهله في العادة، أما Anthropic فتقول إن منع `Claude-User` يمنعها من جلب محتواك للمستخدمين.
- ميزات الذكاء الاصطناعي في بحث Google، مثل «النبذات باستخدام الذكاء الاصطناعي» (AI Overviews)، تتبع قواعد `Googlebot` لا `Google-Extended`، ولتحدّ مما يُعرض فيها من صفحاتك استعمل `nosnippet` أو `noindex`.

## مثال

ملف robots.txt يسمح لزواحف البحث ويمنع زواحف التدريب:

```text
# زواحف البحث: مسموح لها
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
Allow: /

# زواحف التدريب: ممنوع عليها
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /
```

المجموعة التي تحمل اسم الزاحف تتقدم على مجموعة `*`. وتقول OpenAI إن أنظمة البحث لديها قد تحتاج نحو 24 ساعة لتلحق بالتعديل.

## أخطاء شائعة

- قائمة منع منسوخة تمنع زواحف البحث مع زواحف التدريب، فيغيب الموقع عن إجابات البحث بالذكاء الاصطناعي.
- قواعد في ملف النطاق الرئيسي وحده، والموقع العربي على `ar.example.com`: تطلب Anthropic أن تكون القواعد في ملف كل نطاق فرعي.
- جدار حماية يحجب زواحف يسمح لها robots.txt: توصي Perplexity بالسماح لزواحفها فيه بمطابقة اسمها وعناوين IP التي تنشرها معاً.

## المراجع

- [OpenAI: زواحف OpenAI](https://developers.openai.com/api/docs/bots) (بالإنجليزية)
- [Anthropic: هل تزحف Anthropic إلى الويب، وكيف يمنع أصحاب المواقع زواحفها؟](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) (بالإنجليزية)
- [Perplexity: زواحف Perplexity](https://docs.perplexity.ai/docs/resources/perplexity-crawlers) (بالإنجليزية)
- [Google: قائمة ببرامج الزحف الشائعة من Google](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers?hl=ar)
- [Google Search Central: موقعك الإلكتروني والميزات التي تستخدم الذكاء الاصطناعي](https://developers.google.com/search/docs/appearance/ai-features?hl=ar)
- [RFC 9309: بروتوكول استبعاد الروبوتات](https://www.rfc-editor.org/rfc/rfc9309.html) (بالإنجليزية)

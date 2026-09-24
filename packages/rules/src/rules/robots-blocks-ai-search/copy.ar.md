---
reviewed: false
---

# robots.txt يمنع زواحف البحث بالذكاء الاصطناعي

## الرسائل

### disallowed

ملف robots.txt يمنع {token}، زاحف البحث لدى {provider}، من هذه الصفحة بالقاعدة «{rule}» في السطر {line}.

### server-error

ملف robots.txt ردّ بالحالة HTTP {status}، والزواحف التي تتبع RFC 9309، ومنها زواحف البحث بالذكاء الاصطناعي، تعامل ذلك كمنع للموقع كله.

### unreachable

تعذّر الوصول إلى ملف robots.txt، والزواحف التي تتبع RFC 9309، ومنها زواحف البحث بالذكاء الاصطناعي، تعامل ذلك كمنع للموقع كله.

## لماذا يهم

- خدمات البحث بالذكاء الاصطناعي، مثل بحث ChatGPT وClaude وPerplexity، تجيب عن الأسئلة مع روابط إلى مصادرها. زواحف البحث لديها (OAI-SearchBot وClaude-SearchBot وPerplexityBot) هي التي تجمع الصفحات التي يمكن ذكرها في الإجابات.
- إذا منعها robots.txt فقد تُستبعد صفحتك من تلك الإجابات: توثّق OpenAI أن المواقع التي تمنع OAI-SearchBot لا تظهر في إجابات بحث ChatGPT، وتوثّق Anthropic وPerplexity أثراً مشابهاً على الظهور في نتائجهما.
- زواحف البحث غير زواحف تدريب النماذج، مثل GPTBot وClaudeBot وGoogle-Extended. منع التدريب قرار مشروع لا نعدّه مخالفة، لكن قد تُمنع زواحف البحث معه بالخطأ، بقاعدة عامة أو بقائمة منسوخة.

## كيف تُصلح

اسمح لزواحف البحث، وامنع زواحف التدريب إن أردت:

```text
# اسمح للبحث بالذكاء الاصطناعي بأن يذكر الموقع
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
Allow: /

# لا تستخدموا المحتوى في تدريب النماذج
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /
```

مجموعة باسم الزاحف تتقدم على مجموعة `*`، فهذا يعمل حتى لو كان في الملف `User-agent: *` مع `Disallow: /`.

## كيف نكشف

1. نستخدم محلل robots.txt ومطابقته نفسيهما في قاعدة Googlebot، لكل زاحف بحث في قائمتنا: OAI-SearchBot من OpenAI، وClaude-SearchBot من Anthropic، وPerplexityBot من Perplexity. تحققنا من الأسماء والأغراض في توثيق كل مزوّد، ونحدّث القائمة حين يغيّرونها.
2. زواحف التدريب والزواحف التي تجلب الصفحة بطلب من مستخدم تظهر في جدول الزواحف في التقرير، مسموحة أو ممنوعة، ولا تجعل القاعدة تفشل.
3. إذا ردّ robots.txt بخطأ 5xx أو 429 أو تعذّر الوصول إليه، فإن RFC 9309 يطلب من الزواحف أن تعامل الموقع كله كممنوع، فنذكر ذلك في مخالفة واحدة.

## المراجع

- [OpenAI: زواحف OpenAI](https://developers.openai.com/api/docs/bots) (بالإنجليزية)
- [Anthropic: زواحف Anthropic وكيف يمنعها أصحاب المواقع](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) (بالإنجليزية)
- [Perplexity: كيف يتبع Perplexity ملف robots.txt](https://www.perplexity.ai/help-center/en/articles/10354969-how-does-perplexity-follow-robots-txt) (بالإنجليزية)
- [RFC 9309: بروتوكول استبعاد الروبوتات](https://www.rfc-editor.org/rfc/rfc9309.html) (بالإنجليزية)

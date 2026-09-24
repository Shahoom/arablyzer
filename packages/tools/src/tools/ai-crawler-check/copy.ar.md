---
reviewed: false
---

# فحص زواحف الذكاء الاصطناعي

يقرأ ملف robots.txt لموقعك ويبيّن أي زواحف الذكاء الاصطناعي يسمح لها بالوصول إلى الصفحة وأيها يمنعها، وينبّهك إن كانت زواحف البحث ممنوعة.

## ماذا تفحص

- هل يمنع robots.txt الصفحة عن زواحف البحث بالذكاء الاصطناعي: `OAI-SearchBot` من OpenAI، و`Claude-SearchBot` من Anthropic، و`PerplexityBot` من Perplexity.
- حالة زواحف التدريب والجلب بطلب المستخدم لدى هذه الشركات، و`Google-Extended`، مسموحة أو ممنوعة، كمعلومة لا كمخالفة.
- هل يرد robots.txt بخطأ 5xx أو 429 أو لا يمكن الوصول إليه، فتعامله الزواحف كمنع للموقع كله.

## مثال

### خطأ

```robots.txt
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: PerplexityBot
Disallow: /
```

### صحيح

```robots.txt
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
Allow: /

User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /
```

## كيف تُصلح

اسمح لزواحف البحث، وامنع زواحف التدريب إن أردت:

```text
# اسمح للبحث بالذكاء الاصطناعي بالاستشهاد بالموقع
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
Allow: /

# أبقِ المحتوى خارج تدريب النماذج
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /
```

المجموعة التي تسمّي زاحفاً باسمه تتقدم على مجموعة `*`، فيعمل هذا حتى لو كان في الملف `User-agent: *` مع `Disallow: /`.

## أسئلة شائعة

### ما الفرق بين زواحف البحث وزواحف التدريب؟

زواحف البحث، مثل `OAI-SearchBot` و`Claude-SearchBot` و`PerplexityBot`، تجمع الصفحات التي تستشهد بها إجابات البحث بالذكاء الاصطناعي مع رابط إلى المصدر. أما `GPTBot` و`ClaudeBot` فتجمع المحتوى لتدريب النماذج، و`Google-Extended` اسم في robots.txt يضبط استخدام Google لمحتواك في تدريب نماذجه ولا يؤثر في ظهورك في بحث Google. منع التدريب خيار مشروع لا نعدّه مشكلة.

### هل يؤثر منع زواحف البحث على ظهور موقعي؟

قد تُستبعد صفحاتك من إجابات تلك الخدمات: توثّق OpenAI أن المواقع التي تمنع `OAI-SearchBot` لا تظهر في إجابات بحث ChatGPT، وتوثّق Anthropic وPerplexity أثراً مشابهاً على الظهور في نتائجهما.

### هل تكشف الأداة حجب جدار الحماية للزواحف؟

لا. تقرأ الأداة robots.txt فقط، وقد يحجب جدار حماية أو خدمة لحماية المواقع من البوتات زاحفاً يسمح له robots.txt. ونجلب الملف باسم `ArablyzerBot`، فالنتيجة تصف ما استلمناه نحن.

## المنهجية

نجلب robots.txt من أصل الصفحة باسم `ArablyzerBot`، ونقرؤه حسب RFC 9309 وبتسامح محلل Google مفتوح المصدر، حتى 500 كيلوبايت، ونتبع 5 تحويلات على الأكثر. لكل زاحف في قائمتنا نختار المجموعة التي تسمّيه، أو مجموعة `*` إن لم توجد، ثم تحكم أطول قاعدة تطابق مسار الصفحة. أسماء الزواحف وأغراضها مأخوذة من توثيق كل شركة، ونحدّثها حين تتغير.

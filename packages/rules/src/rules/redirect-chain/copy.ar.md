---
reviewed: false
---

# سلسلة تحويلات قبل الصفحة

## الرسائل

### chain

عدد التحويلات المتتالية قبل الوصول إلى هذه الصفحة {count}، بدءاً من {from}. اجعل ذلك العنوان يحوّل مباشرة إلى {to}.

## لماذا يهم

- كل تحويل طلب وجواب إضافيان قبل أن تبدأ الصفحة بالتحميل، فكل زائر يصل من ذلك العنوان ينتظرها كلها.
- زواحف Google تتبع حتى 10 تحويلات متتالية. وعند نقل الموقع ينصح Google بالتحويل إلى العنوان النهائي مباشرة، فإن لم يمكن فبإبقاء السلسلة قصيرة: لا تزيد على 3 تحويلات في أحسن الأحوال، وتبقى دون 5.
- تطول السلاسل حين تُضاف التحويلات واحداً بعد آخر: من HTTP إلى HTTPS، ثم من `example.com` إلى `www.example.com`، ثم إلى مسار اللغة. كل واحد يعمل وحده، لكنها معاً تجعل العنوان الأول يمر بثلاث رحلات قبل الصفحة.

## كيف تُصلح

حوّل كل عنوان قديم إلى العنوان النهائي مباشرة، بتحويل دائم واحد. في nginx تكفي كتلة `server` واحدة لترسل الاسمين عبر HTTP إلى العنوان النهائي:

```nginx
server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://www.example.com$request_uri;
}
```

- وفي Apache (الوحدة mod_rewrite) تكفي قاعدة واحدة للحالتين:

```apache
RewriteEngine On
RewriteCond %{HTTPS} off [OR]
RewriteCond %{HTTP_HOST} !^www\. [NC]
RewriteRule ^ https://www.example.com%{REQUEST_URI} [R=301,L]
```

- واستخدم العنوان النهائي في كل مكان تتحكم فيه: في روابط صفحاتك، وفي خريطة الموقع، وفي روابط canonical، فلا يحتاج أحد إلى التحويل أصلاً.

## كيف نكشف

1. نجلب العنوان الذي تعطيه باسم `ArablyzerBot`، ونتبع تحويلاته (`301` و`302` و`303` و`307` و`308`) حتى 10، وبعدها يتوقف الفحص بخطأ.
2. تنطبق القاعدة إذا تبع الفحص تحويلاً واحداً على الأقل إلى صفحة ترد بحالة 2xx، وتفشل إذا تبع أكثر من تحويل. وتعرض النتيجة السلسلة، كل عنوان مع حالته.
3. لا نتبع إلا تحويلات HTTP: فالتحويل بوسم `<meta http-equiv="refresh">` أو عبر JavaScript لا نتبعه.

## المراجع

- [Google Search Central: التحويلات وبحث Google](https://developers.google.com/search/docs/crawling-indexing/301-redirects) (بالإنجليزية)
- [Google Search Central: نقل الموقع مع تغيير عناوين URL](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes) (بالإنجليزية)
- [IETF: المعيار RFC 9110، القسم 15.4 عن التحويلات](https://www.rfc-editor.org/rfc/rfc9110#section-15.4) (بالإنجليزية)

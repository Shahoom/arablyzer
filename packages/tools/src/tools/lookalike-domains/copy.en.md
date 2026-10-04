---
summary: Which look-alikes of your site's domain someone else has registered: typos, digits for letters (Arabizi) and the Arab country suffixes.
---

# Look-alike domain radar

Makes up names close to your site's domain, asks which are registered with a site or mail, and when their first security certificate was issued.

## What it checks

- Up to 100 names close to your domain: the same name on other suffixes (com, net, co and the Arab country codes), digits for letters as Arabic speakers type in Arabizi (2, 3, 5, 6, 7 and 9), a letter left out, doubled or swapped, a letter from the next key, a hyphen, and confusable letters.
- Which have an A record (a site) or an MX record (mail) in DNS, asked over HTTPS at Cloudflare.
- For the registered ones, when the first security certificate was logged in the Certificate Transparency log (crt.sh); a recent one points to an imitator preparing a site.
- We open no look-alike site; only the names are sent.

## Example

### Wrong

```html
<p>موقعنا الرسمي alwaha.com.sa وليس لنا موقع آخر ولم نسجل الأسماء المشابهة.</p>
```

### Right

```html
<p>موقعنا الرسمي alwaha.com.sa وقد سجلنا الأسماء المشابهة له وفعلنا DMARC.</p>
```

## How to fix

- Look at each domain in the list: if it is yours, move it into your account; if it is not, see what it shows.
- Register the near names that matter to you to close the door on imitators.
- Turn on SPF, DKIM and DMARC for your domain so that spoofed messages are rejected.
- If a domain is used for fraud, report it to its registrar and to Google Safe Browsing.

## FAQ

### Is every domain in the list an imitator?

No. An innocent company may have a name close to yours. The list is for review, not accusation; we only point at new domains that have mail or a recent certificate.

### Why does a look-alike I know is registered not show?

We ask only the names we generate (up to 100), the common mistakes. A name we do not generate is not seen, and a registered name without an A or MX record is not seen either.

### What if the certificate log did not answer?

crt.sh is a free service that can be slow or refuse. We say so and show the domains without the certificate date, and we keep what we got for a whole day.

## Methodology

We generate names by fixed rules (suffixes, Arabizi, typos) in a fixed order, capped at 100, and ask DNS over HTTPS (Cloudflare's JSON API) for each name's A and MX, five requests at a time with a short pause, then ask crt.sh about the registered names (12 at most, one after another, a second and a half apart) and keep the answer for a day. We visit no look-alike site.

---
summary: Do your call and email links work, or hold Arabic digits and no country code?
---

# Phone and email links checker

Reads the `tel:` and `mailto:` links of a page and checks that a tap does what it should: a phone number in digits 0–9 with its country code that can exist, and an email address with a name, an @ and a domain. It never dials or sends.

## What it checks

- That a `tel:` number is written with digits 0–9, not Eastern Arabic digits.
- That it starts with the country code (`+966`, `+971`, `+968`) so it dials from anywhere, not only from inside the country.
- That the number is possible in its country (libphonenumber's numbering plans).
- That a `mailto:` address has a name, an @ and a domain with a dot.

## Example

### Wrong

```html
<li><a href="tel:0501234567" dir="ltr">اتصل بالرياض</a></li>
<li><a href="tel:+٩٦٦٥٠١٢٣٤٥٦٧" dir="ltr">اتصل بالفرع الرئيسي</a></li>
```

### Right

```html
<li><a href="tel:+966501234567" dir="ltr">اتصل بالرياض</a></li>
<li><a href="tel:+96891234567" dir="ltr">اتصل بمسقط</a></li>
```

## How to fix

1. Write the link's address in the global form: `tel:+966501234567`; the text can stay as people like it: «050 123 4567».
2. Take the local 0 out after the country code: `+966 50…`, not `+966 050…`.
3. Use digits 0–9 in the address, whatever digits the text shows.
4. Show the number with `dir="ltr"` so Arabic text does not reorder its digits.
5. Write the email address as the mailbox gives it, and test the link on a phone.

For example:

```html
<a href="tel:+966501234567" dir="ltr">050 123 4567</a>
```

## FAQ

### Do Eastern Arabic digits not work in a `tel:` link?

Phones dial the digits 0–9 of the address; many do not read Eastern Arabic digits there at all, and others dial a wrong number. Show them in the text if you like, and give the address digits 0–9.

### Why the country code if my customers are all local?

Because a customer abroad, a map on a phone, a tablet in roaming and a search engine's "call" button read the address without your country. The global form works for the locals too.

### Does it check my WhatsApp number?

No, that is the WhatsApp tools' work. This one is for `tel:` and `mailto:`.

### Does it call or write to me?

No. It reads the written form only. It cannot tell if the number answers or the mailbox exists.

## Methodology

We find the links that start with `tel:` or `mailto:` in the page's HTML as the server sends it. A number is checked for Eastern Arabic digits, a leading `+` or `00`, and libphonenumber's numbering plans (Google's data) for a possible number; an email address for an @, a domain with a dot and no spaces. See the rule's page for the details.

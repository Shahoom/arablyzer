# Phone or email link is written in a form that fails

## Messages

### tel-arabic-digits

The phone link “{number}” is written with Eastern Arabic digits; phones dial digits 0–9 only.

### tel-no-country

The phone link “{number}” has no country code; write it as +966 50 123 4567 so it dials from anywhere.

### tel-invalid

The phone link “{number}” is not a possible number in its country.

### mailto-invalid

The email link “{address}” is not an email address: it needs a name, an @ and a domain.

## Why it matters

- A tap on "call us" is the shortest road to an order on a phone. When the link has Arabic digits, or no country code and the visitor is abroad, nothing dials or the wrong number does.
- A number in Eastern Arabic digits is common because the same text is shown to people: the link's address must be a different, plain string.
- A `mailto:` with a typo opens a mail app addressed to nobody, and the customer never writes.
- The global form `+<country code><number>` follows RFC 3966, which defines the `tel:` links.

## How to fix

Keep the text people read as you like, and write the address the machine dials in global form:

```html
<a href="tel:+966501234567" dir="ltr">+966 50 123 4567</a>
<a href="mailto:orders@shop.example">orders@shop.example</a>
```

- Country code first (`+966` Saudi Arabia, `+971` UAE, `+968` Oman, `+965` Kuwait, `+973` Bahrain, `+974` Qatar, `+20` Egypt), then the number without its local 0.
- Digits 0–9 in the address, whatever the digits shown.
- Show the number left to right with `dir="ltr"` so its digits stay in order inside Arabic text.
- Test each link on a phone.

## How we detect

1. We find the links that start with `tel:` or `mailto:`.
2. A `tel:` number is flagged when it has Eastern Arabic digits, when it does not start with `+` or `00`, or when, with a country code, it is not a possible number by the numbering plans libphonenumber uses (Google's data).
3. A `mailto:` address is flagged when its first address has no @, no domain with a dot, or has spaces. Internationalised domains are accepted.

We never dial or send: the check is of the written form.

## References

- [RFC 3966: The tel URI for Telephone Numbers](https://www.rfc-editor.org/rfc/rfc3966)
- [RFC 6068: The mailto URI scheme](https://www.rfc-editor.org/rfc/rfc6068)
- [ITU-T E.164: The international public telecommunication numbering plan](https://www.itu.int/rec/T-REC-E.164)

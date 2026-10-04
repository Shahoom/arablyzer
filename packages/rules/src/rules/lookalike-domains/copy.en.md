# Look-alike domains of your site are registered

## Messages

### fresh

The domain {domain} looks like {original} ({kind}) and has {records} records, and its first security certificate in the Certificate Transparency log is dated {date}, which is recent. This is what someone setting up an imitation site does.

### mail

The domain {domain} looks like {original} ({kind}) and has a mail server (MX), so it can send messages that look as if they came from your brand.

### registered

The domain {domain} looks like {original} ({kind}) and is registered, with {records} records.

## Why it matters

- **Imitators register names close to a known brand's**: a letter left out, doubled or swapped, a digit in place of a letter as Arabic speakers type in Arabizi (3 for ع, 7 for ح, 5 for خ, 2 for the hamza and 9 for ق), or the same name on another suffix.
- **A look-alike with a mail server** sends invoices and messages that seem to come from you, and one with a fake login page steals accounts and burns your reputation.
- **A fresh certificate for a look-alike** is a known sign of a campaign being set up; not every certificate is bad, since the domain may be yours or an innocent company's.

## How to fix

- Look at each domain in the list: if it is yours, move it into your account; if it is not, see what it shows.
- Register the near names that matter to you (the common suffixes for you and the most common misspellings of your name) to close the door.
- Turn on SPF, DKIM and DMARC for your own domain so that spoofed messages are rejected (see our DMARC check).
- If a domain is used for fraud, report it to its registrar and to [Google Safe Browsing](https://safebrowsing.google.com/safebrowsing/report_phish/).

## How we detect

1. We generate up to 100 names like your domain: the same name on other suffixes (com, net, co and the Arab country codes), digits for letters as in Arabizi (2, 3, 5, 6, 7 and 9), a letter left out, doubled or swapped with its neighbour, a letter from an adjacent key, a hyphen, and confusable letters (rn for m, say).
2. We ask DNS over HTTPS at Cloudflare for each name's A and MX records, five requests at a time with a short pause. A name with either is counted as registered.
3. We ask [crt.sh](https://crt.sh/) (the Certificate Transparency log) for the certificates of the registered names, 12 names at most, one at a time with a second and a half between, and keep the answer for a day. A first certificate within 90 days is recent.
4. We open no look-alike site and visit none: only the names go to the resolver and to crt.sh.
5. A registered name may belong to an innocent business; this is a list to review, not an accusation. It is a minor finding.

## References

- [Cloudflare: DNS over HTTPS, JSON format](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)
- [RFC 9162: Certificate Transparency 2.0](https://www.rfc-editor.org/rfc/rfc9162)
- [Wikipedia: Arabic chat alphabet (Arabizi)](https://en.wikipedia.org/wiki/Arabic_chat_alphabet)

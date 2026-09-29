# No DMARC record for the domain

## Messages

### missing

`{domain}` has no DMARC record at `_dmarc.{domain}`: no TXT record there starts with the tag `v=DMARC1`, so mail servers find no policy of yours for messages that carry its name and pass neither SPF nor DKIM.

### several

`_dmarc.{domain}` has {count} DMARC records, where one is allowed: with more than one, mail servers apply no DMARC policy to the domain's mail.

## Why it matters

- A DMARC record tells mail servers what to do with messages that carry your domain's name and pass neither SPF nor DKIM: deliver them, quarantine them or reject them. It also has reports sent to you on what is sent in your domain's name.
- When a domain has no record, RFC 7489 says mail servers should not apply DMARC to its messages, so you have no say over messages that impersonate it.
- Gmail asks those who send more than 5,000 messages a day to Gmail accounts to set up DMARC, and allows its policy to be `none`.
- The record on the organizational domain covers its subdomains too: the `sp` tag sets their policy, and when it is absent, `p` does.

## How to fix

Add a TXT record named `_dmarc` on the domain, starting with `v=DMARC1`. Google advises starting with the policy `none` and following the reports:

```dns
_dmarc.example.com.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"
```

- Google says to wait 48 hours after setting up SPF or DKIM before setting up DMARC.
- Once the reports show your mail passes, tighten the policy to `quarantine`, then `reject`.
- If the domain never sends mail, the record M3AAWG recommends asks mail servers to reject what fails the check, which, for a domain that sends no mail, is all mail in its name:

```dns
_dmarc.example.com.  TXT  "v=DMARC1; p=reject"
```

- One record only at `_dmarc`: two records that each start with `v=DMARC1` void DMARC altogether.

## How we detect

1. We take the page's organizational domain from its name, as RFC 7489 (§3.2) defines it from the Public Suffix List: a page on `www.shop.example.com.sa` has the domain `example.com.sa`.
2. We ask the DNS resolver the scanner uses for the TXT records of that domain's `_dmarc` name alone (§6.1), and for no other type or name. A mail server asks for the record of the domain in the sender's address, then for its organizational domain's when it finds none (§6.6.3), so the record we read is the one every subdomain without its own falls back to.
3. The rule fails when no record starts with the tag `v` whose value is `DMARC1`, in capitals and exactly, with spaces allowed around the `=` (§6.3 and §6.4), or when more than one does.
4. When no answer comes in time, the DNS server answers with an error, or the server that scans does not ask DNS itself, we do not judge: the report says the rule could not run.
5. We do not check the policy (`p`) or the report addresses, nor records of subdomains' own. Pages on an IP address, on a local name such as `localhost` or one that ends in `.test`, or on a private address are left out.

## References

- [IETF: RFC 7489, Domain-based Message Authentication, Reporting, and Conformance (DMARC)](https://www.rfc-editor.org/rfc/rfc7489)
- [Google Workspace: Set up DMARC](https://knowledge.workspace.google.com/admin/security/set-up-dmarc)
- [Google Workspace: About authentication methods](https://knowledge.workspace.google.com/admin/security/about-authentication-methods)
- [Gmail: Email sender guidelines](https://support.google.com/a/answer/81126)
- [M3AAWG: Protecting Parked Domains Best Common Practices](https://www.m3aawg.org/sites/default/files/legacy/m3aawg_parked_domains_bp-2015-12.pdf)

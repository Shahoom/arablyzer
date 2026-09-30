# No valid DMARC record for the domain

## Messages

### missing

`{domain}` has no DMARC record at `_dmarc.{domain}`: no TXT record there starts with the tag `v=DMARC1`, so mail servers find no policy of yours for messages that carry its name and pass neither SPF nor DKIM.

### several

`_dmarc.{domain}` has {count} DMARC records, where one is allowed: with more than one, mail servers apply no DMARC policy to the domain's mail.

### malformed

`_dmarc.{domain}` has a record that starts with `v=DMARC1` but is not written as RFC 7489 (§6.4) asks: a `;` must follow the version tag, so mail servers may not read it as a DMARC record.

### no-policy

`_dmarc.{domain}` has a DMARC record without a `p` tag: RFC 7489 (§6.3) requires it, with the value `none`, `quarantine` or `reject`, so the record does not say what to do with messages that fail the checks.

### bad-policy

The `p` tag of the DMARC record at `_dmarc.{domain}` is “{value}”, and RFC 7489 (§6.3) allows `none`, `quarantine` or `reject` alone, so the record does not say what to do with messages that fail the checks.

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
- The `p` tag is required, and its value is `none`, `quarantine` or `reject`. Write a `;` after `v=DMARC1` and between the tags.

## How we detect

1. We take the page's organizational domain from its name, as RFC 7489 (§3.2) defines it from the Public Suffix List: a page on `www.shop.example.com.sa` has the domain `example.com.sa`.
2. We ask a DNS resolver for the TXT records of that domain's `_dmarc` name alone (§6.1), and for no other type or name, as DNS over HTTPS (RFC 8484): Cloudflare's resolver, or the one the scanner is set to, through the same egress proxy as the rest of the scan's traffic. A scan that runs on a machine without an egress proxy asks that machine's DNS servers instead. A mail server asks for the record of the domain in the sender's address, then for its organizational domain's when it finds none (§6.6.3), so the record we read is the one every subdomain without its own falls back to.
3. The rule fails when no record starts with the tag `v` whose value is `DMARC1`, in capitals and exactly, with spaces allowed around the `=` (§6.3 and §6.4), or when more than one does. It fails, with a message of its own, when the one record has no `p` tag, or a `p` whose value is not `none`, `quarantine` or `reject` (§6.3; in any letter case, and wherever among the tags it stands), and when a record starts with `v=DMARC1` but no `;` follows it, which the grammar of §6.4 requires. RFC 7489 (§6.6.3) lets a receiver read a record with a valid `rua` and no valid `p` as `p=none`; we still fail it, since the record does not set the policy the RFC requires.
4. When no answer comes in time, or the DNS server answers with an error, we do not judge: the report says the rule could not run. A scan with no way to ask DNS leaves the rule out, and the report says so.
5. We do not check the other tags (`sp`, `rua`, `pct`), nor records of subdomains' own. Pages on an IP address, on a local name such as `localhost` or one that ends in `.test`, on a private address, or on a site a platform gives its customers, such as `user.github.io`, `shop.myshopify.com` or `site.vercel.app`, are left out: the DNS of that zone is the platform's, and its customers cannot change it. The rule does not apply to them.

## References

- [IETF: RFC 7489, Domain-based Message Authentication, Reporting, and Conformance (DMARC)](https://www.rfc-editor.org/rfc/rfc7489)
- [Google Workspace: Set up DMARC](https://knowledge.workspace.google.com/admin/security/set-up-dmarc)
- [Google Workspace: About authentication methods](https://knowledge.workspace.google.com/admin/security/about-authentication-methods)
- [Gmail: Email sender guidelines](https://support.google.com/a/answer/81126)
- [M3AAWG: Protecting Parked Domains Best Common Practices](https://www.m3aawg.org/sites/default/files/legacy/m3aawg_parked_domains_bp-2015-12.pdf)

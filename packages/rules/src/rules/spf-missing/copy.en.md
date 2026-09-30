# No SPF record for the domain

## Messages

### missing

`{domain}` has no SPF record: none of its TXT records starts with `v=spf1`, so a mail server that receives a message in its name cannot tell whether an allowed server sent it.

### several

`{domain}` has {count} SPF records, where one is allowed: with more than one, mail servers count the check as a permanent error (`permerror`) and read none of them.

## Why it matters

- An SPF (Sender Policy Framework) record names the servers allowed to send mail in your domain's name. Google says SPF helps stop others from impersonating you and sending mail that seems to come from your organization.
- Gmail asks every sender to set up SPF or DKIM for its sending domain. Those who send more than 5,000 messages a day to Gmail accounts must set up both SPF and DKIM, and DMARC too.
- A domain that never sends mail needs the record as well: M3AAWG recommends one that says no server is allowed, so its name cannot be spoofed.

## How to fix

Add one TXT record in DNS on the domain itself (the name `@` in most control panels) that starts with `v=spf1` and names every service that sends your mail. If you send through Google Workspace alone, the record Google gives is:

```dns
example.com.  TXT  "v=spf1 include:_spf.google.com ~all"
```

- Each mail service says in its guide what to add to the record, such as an `include:` of its own. Put them all in one record: two records that each start with `v=spf1` are an error, with which no one reads either.
- If the domain never sends mail, the record M3AAWG recommends is:

```dns
example.com.  TXT  "v=spf1 -all"
```

- With SPF, add a DMARC record, which tells mail servers what to do with messages that fail the check (the `dmarc-missing` rule).

## How we detect

1. We take the page's organizational domain from its name, as RFC 7489 (§3.2) defines it from the Public Suffix List: a page on `www.shop.example.com.sa` has the domain `example.com.sa`. SPF does not fall back to a parent domain, so a subdomain's own record, if it has one, is not read.
2. We ask a DNS resolver for that domain's TXT records alone, and for no other type or name, as DNS over HTTPS (RFC 8484): Cloudflare's resolver, or the one the scanner is set to, through the same egress proxy as the rest of the scan's traffic. A scan that runs on a machine without an egress proxy asks that machine's DNS servers instead. A record split into several strings is read as one (RFC 7208, §3.3).
3. The rule fails when no record starts with `v=spf1` followed by a space or the record's end, in any letter case (RFC 7208, §4.5), or when more than one does. A name that does not exist in DNS has no record.
4. When no answer comes in time, or the DNS server answers with an error, we do not judge: the report says the rule could not run. A scan with no way to ask DNS leaves the rule out, and the report says so.
5. We do not check what the record says after `v=spf1`, nor DKIM. Pages on an IP address, on a local name such as `localhost` or one that ends in `.test`, or on a private address are left out.

## References

- [IETF: RFC 7208, Sender Policy Framework (SPF)](https://www.rfc-editor.org/rfc/rfc7208)
- [IETF: RFC 7489, §3.2 Organizational Domain](https://www.rfc-editor.org/rfc/rfc7489#section-3.2)
- [Google Workspace: About authentication methods](https://knowledge.workspace.google.com/admin/security/about-authentication-methods)
- [Google Workspace: Set up SPF](https://knowledge.workspace.google.com/admin/security/set-up-spf)
- [Gmail: Email sender guidelines](https://support.google.com/a/answer/81126)
- [M3AAWG: Protecting Parked Domains Best Common Practices](https://www.m3aawg.org/sites/default/files/legacy/m3aawg_parked_domains_bp-2015-12.pdf)

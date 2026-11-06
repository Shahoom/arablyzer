---
reviewed: false
---

# Email authentication (SPF, DKIM and DMARC)

Email authentication is three DNS records: SPF names the servers allowed to send for your domain, DKIM signs the message, and DMARC says what to do with mail that fails.

## Definition

- SPF (Sender Policy Framework) is a TXT record on the domain itself that starts with `v=spf1`, with which the domain owner names the hosts allowed to use its domain (RFC 7208). The standard checks the `MAIL FROM` and `HELO` domains of the SMTP session; it does not itself check the domain of the `From` field the reader sees.
- DKIM (DomainKeys Identified Mail) is a digital signature the sending server adds in a `DKIM-Signature` header. It covers the message body and selected header fields, which must include `From`. The signature names the signing domain in its `d=` tag and a selector in its `s=` tag, and the public key is a DNS TXT record named `selector._domainkey.domain` (RFC 6376). A valid signature shows that the signing domain takes responsibility for the message.
- DMARC is a TXT record named `_dmarc` on the domain, starting with `v=DMARC1`. With it the domain owner says what should happen to mail that carries the domain in `From` and fails the checks, and asks for reports (RFC 7489). It builds on SPF and DKIM rather than replacing them: a message passes DMARC if at least one of them passes with a domain aligned with the `From` domain. The `p` tag is `none`, `quarantine` or `reject`, and `rua` is an address for aggregate reports.

## Why it matters

- Without these records, receiving mail servers cannot tell whether a message carrying your domain was sent by a server you authorised, or what to do with one that fails. Google says SPF helps prevent others from impersonating you, DKIM prevents message contents from being changed in transit, and DMARC lets you choose what happens to messages that fail them.
- Gmail asks everyone who sends to Gmail accounts to set up SPF or DKIM. Anyone sending more than 5,000 messages a day to them needs SPF, DKIM and DMARC, and Google allows the DMARC policy to be `none`.
- A domain that never sends mail needs the records too: M3AAWG recommends the SPF record `v=spf1 -all`, which says no host is allowed, and a DMARC record with `p=reject`.
- Arablyzer's email security check looks at SPF and DMARC but not DKIM: the DKIM key sits in DNS under a selector each mail service chooses, as RFC 6376 (section 3.6.2.1) says, so a page check cannot know where to look.

## Example

The records of a domain that sends its mail through Google Workspace alone:

```dns
example.com.                       TXT  "v=spf1 include:_spf.google.com ~all"
selector1._domainkey.example.com.  TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkq..."
_dmarc.example.com.                TXT  "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"
```

- The first lets Google's servers send for the domain. `~all` makes everything else a `softfail` (RFC 7208, section 4.6.2).
- The second publishes the public key for the selector `selector1`; signatures on that server's mail carry `d=example.com` and `s=selector1`.
- The third announces the policy `none`, so it asks nobody to change anything yet, and requests aggregate reports at `dmarc-reports@example.com`.

## Common mistakes

- More than one SPF record on the domain: RFC 7208 (section 4.5) treats it as a permanent error, `permerror`, so none is read. Put every service in a single record.
- More than 10 SPF terms that cause DNS queries, namely `include`, `a`, `mx`, `ptr`, `exists` and `redirect`: RFC 7208 (section 4.6.4) requires implementations to return `permerror` then.
- Setting up DMARC before SPF and DKIM work: Google advises waiting 48 hours after setting them up, and starting with the policy `none` before tightening to `quarantine` or `reject`.
- Assuming a pass from SPF or DKIM alone satisfies DMARC: the domain that passed has to match the `From` domain (RFC 7489, section 3.1).
- Leaving a domain that never sends mail without records, so its name stays open to impersonation.

## References

- [IETF: RFC 7208, Sender Policy Framework (SPF)](https://www.rfc-editor.org/rfc/rfc7208)
- [IETF: RFC 6376, DomainKeys Identified Mail (DKIM) Signatures](https://www.rfc-editor.org/rfc/rfc6376)
- [IETF: RFC 7489, DMARC](https://www.rfc-editor.org/rfc/rfc7489)
- [Google Workspace: About email authentication methods](https://knowledge.workspace.google.com/admin/security/about-authentication-methods?hl=en)
- [Gmail: Email sender guidelines](https://support.google.com/a/answer/81126?hl=en)
- [M3AAWG: Protecting Parked Domains Best Common Practices](https://www.m3aawg.org/sites/default/files/legacy/m3aawg_parked_domains_bp-2015-12.pdf)

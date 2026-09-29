---
summary: Can mail servers catch a message that impersonates your site's domain?
---

# Email security checker: SPF and DMARC

Checks your site's domain for its SPF and DMARC records in DNS: what mail servers read to tell whether an allowed server sent a message that carries your domain's name, and what to do with it when none did.

## What it checks

- One SPF record on the domain itself: a TXT record that starts with `v=spf1` and names the servers allowed to send its mail. Two or more are an error with which mail servers read none of them.
- One DMARC record at the domain's `_dmarc` name: a TXT record that starts with the tag `v=DMARC1` and tells mail servers what to do with messages that pass neither SPF nor DKIM.
- The domain checked is the organizational domain of the page's address: a page on `www.example.com` has the domain `example.com`, and a DMARC record there covers its subdomains too.

## Example

### Wrong

```dns
example.com.  TXT  "google-site-verification=wA4bXl2mQv9s3TKpZ7uYcN1eRdHf0gJhK8oLiPqS6xE"
```

### Right

```dns
example.com.         TXT  "v=spf1 include:_spf.google.com ~all"
_dmarc.example.com.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"
```

## How to fix

Add both records at your domain's DNS provider, in the control panel where you manage its records:

1. **SPF**: a TXT record on the domain itself (the name `@` in most control panels) that starts with `v=spf1` and names every service that sends your mail. If you send through Google Workspace alone, the record Google gives is `v=spf1 include:_spf.google.com ~all`. Each other mail service says in its guide what to add: put them all in one record.
2. **DMARC**: a TXT record named `_dmarc` that starts with `v=DMARC1`. Google advises starting with the policy `p=none` and following the reports sent to the `rua` address, then tightening it to `quarantine` or `reject`, and waiting 48 hours after setting up SPF or DKIM before setting up DMARC.

- If the domain never sends mail, M3AAWG recommends these two records:

```dns
example.com.         TXT  "v=spf1 -all"
_dmarc.example.com.  TXT  "v=DMARC1; p=reject"
```

## FAQ

### My site sends no email: does it need these records?

Yes. M3AAWG recommends that every domain that sends no mail publish an SPF record that allows no server (`v=spf1 -all`) and a DMARC record with the policy `p=reject`, so no one can send mail in its name.

### Is SPF enough on its own?

No. SPF names the servers allowed to send; DMARC tells mail servers what to do with a message that passes neither SPF nor DKIM, and has reports sent to you on what is sent in your domain's name. Google advises setting up SPF and DKIM, then DMARC.

### Why does the tool not check DKIM?

Because a DKIM key is in DNS under a name that starts with a selector each mail service chooses and names in its messages, as [RFC 6376](https://www.rfc-editor.org/rfc/rfc6376#section-3.6.2.1) says, so a scan of a page cannot know where to look.

### Why does the check say it did not finish?

Because no answer to the DNS question came in time, the DNS server answered with an error, or the server that scans does not ask DNS itself. A question without an answer says nothing of the records, so we do not judge them.

## Methodology

We take the page's organizational domain from its address, as RFC 7489 defines it from the Public Suffix List, then ask the DNS resolver the scanner uses for the TXT records of two names alone: the domain itself and its `_dmarc` name, and for no other type or name, within ten seconds at most. SPF fails when no record starts with `v=spf1` followed by a space or the record's end (RFC 7208), or when more than one does. DMARC fails when no record starts with the tag `v` whose value is `DMARC1`, in capitals (RFC 7489), or when more than one does. We check nothing further in the records, nor DKIM. When no answer comes, we do not judge, and the report says the check could not run. Pages on an IP address, a local name or a private address are left out. The same records give the same result every time.

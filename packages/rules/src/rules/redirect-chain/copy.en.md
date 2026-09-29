# A chain of redirects before the page

## Messages

### chain

Reaching this page takes {count} redirects, one after another, from {from}. Redirect that address straight to {to}.

## Why it matters

- Each redirect is one more request and answer before the page starts to load, so every visitor who arrives by that address waits for each of them.
- Google's crawlers follow up to 10 redirects in a chain. For a site move, Google advises redirecting to the final address directly or, where that is not possible, keeping the chain short: ideally no more than 3 redirects, and fewer than 5.
- Chains grow as redirects are added one at a time: from HTTP to HTTPS, then from `example.com` to `www.example.com`, then to the language's path. Each works alone; together, the first address takes three trips to reach the page.

## How to fix

Redirect each old address straight to the final one, with a single permanent redirect. In nginx, one `server` block can send both names over HTTP to the final address:

```nginx
server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://www.example.com$request_uri;
}
```

- In Apache (mod_rewrite), one rule covers both cases:

```apache
RewriteEngine On
RewriteCond %{HTTPS} off [OR]
RewriteCond %{HTTP_HOST} !^www\. [NC]
RewriteRule ^ https://www.example.com%{REQUEST_URI} [R=301,L]
```

- Use the final address wherever you control it: in your pages' links, your sitemap and your canonical links, so no one needs the redirect at all.

## How we detect

1. We fetch the address you give as `ArablyzerBot` and follow its redirects (`301`, `302`, `303`, `307` and `308`), up to 10; past that, the scan stops with an error.
2. The rule applies when the fetch followed at least one redirect to a page that answered 2xx, and fails when it followed more than one. The finding shows the chain, each address with its status.
3. We follow HTTP redirects alone: a redirect by `<meta http-equiv="refresh">` or by JavaScript is not followed.

## References

- [Google Search Central: Redirects and Google Search](https://developers.google.com/search/docs/crawling-indexing/301-redirects)
- [Google Search Central: Site moves with URL changes](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
- [IETF: RFC 9110, §15.4 Redirection 3xx](https://www.rfc-editor.org/rfc/rfc9110#section-15.4)

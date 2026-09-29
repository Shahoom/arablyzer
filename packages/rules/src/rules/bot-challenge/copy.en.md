# The site answers bots with a challenge

## Messages

### challenge

The site answered this check's request with a {service} challenge instead of the page (HTTP {status}, “{header}: {value}”). AI crawlers may be refused the same way.

## Why it matters

- Bot protection services, such as Cloudflare and AWS WAF, can answer a request with a challenge page instead of the page asked for. Cloudflare's documentation says a visitor cannot reach the page without passing its challenge, which runs JavaScript in the visitor's browser and may ask them to check a box or press a button; AWS WAF's challenge and CAPTCHA are scripts too.
- The site answered our bot with one, so a crawler that cannot pass the challenge gets it in place of your content. Whether an AI search crawler is challenged too depends on the rules that decide: they may let it through, or refuse it as they refused us.
- Protecting a site from bots is often the right choice, so this is information, not a fault: check that the crawlers you want reach your pages.

## How to fix

- Decide which bots should reach your pages, such as search engines' and AI search services' crawlers, and let them through the rules that challenge.
- In Cloudflare, a custom rule placed first, with the expression `(cf.client.bot)` and the Skip action, lets verified bots, such as search engine crawlers, bypass your other custom rules. Bot Fight Mode, on the Free plan, cannot be bypassed this way: turn it off, or upgrade to Super Bot Fight Mode (Pro and above).
- In AWS WAF, the challenge comes from a rule whose action is CAPTCHA or Challenge: narrow what that rule matches.
- Arablyzer never tries to get past a challenge, so the checks of this page's content did not run.

## How we detect

1. We fetch the page as `ArablyzerBot` and read its answer's headers, whatever its status.
2. A challenge is told apart by the signals its service documents alone: Cloudflare's `cf-mitigated: challenge` header, which it sets on every kind of challenge page, and AWS WAF's `x-amzn-waf-action` header, `challenge` with the status `202` or `captcha` with `405`.
3. We guess nothing from the page's text, a plain refusal such as `403` without these headers is not a challenge to us, and other services' challenges go undetected.
4. When the answer is a challenge, no other check takes it for the page: the report says the site answered with a challenge, and the page is neither rendered in a browser nor measured, since running the challenge's script could get past it.
5. It is information: it never changes the score.

## References

- [Cloudflare: Detect a Challenge Page response](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/)
- [Cloudflare: Interstitial Challenge Pages](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/)
- [Cloudflare: Stop malicious bots](https://developers.cloudflare.com/use-cases/solutions/stop-malicious-bots/)
- [AWS WAF: CAPTCHA and Challenge action behavior](https://docs.aws.amazon.com/waf/latest/developerguide/waf-captcha-and-challenge-actions.html)

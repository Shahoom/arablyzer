# Platform detected

## Messages

### platform

The page runs on {name}{versionText} (confidence {confidence}%). Seen: {evidence}.

### builder

The page is built with {name}{versionText} (confidence {confidence}%). Seen: {evidence}.

### plugin

The page uses the {name} plugin{versionText} (confidence {confidence}%). Seen: {evidence}.

### service

The page loads {name}{versionText} (confidence {confidence}%). Seen: {evidence}.

## Why it matters

- Fixes depend on the platform: the same missing description is a field in a WordPress SEO plugin, a setting in a Salla or Zid store, and a line of code on a hand-written site.
- Knowing the platform and its plugins tells you what to update first, since out-of-date plugins are how most hacked sites are entered, and which of your fixes the platform already does for you.
- A change of platform or of a major plugin changes how a site is crawled and ranked, so it is worth noticing when it happens.

## How to fix

There is nothing to fix: this rule lists what it finds and judges nothing. Use it to pick the right fix for the other findings, on your platform's own settings or plugins, and to check that what you thought you ran is what the page shows.

## How we detect

1. We read what a fetched page shows, without running it: its response headers and cookies, its meta tags (such as `generator`), the addresses of its scripts, stylesheets and images, and its URL.
2. The fingerprints are a pinned subset of the open-source [webappanalyzer](https://github.com/enthec/webappanalyzer) list (GPL-3.0): CMS, e-commerce, page builders, WordPress plugins, analytics, CDN, JavaScript frameworks and tag managers. Arablyzer adds its own for Arab platforms: Salla, Zid and YouCan were checked against public stores, ExpandCart was not and is low confidence.
3. Each marker weighs a number; the confidence is their sum, at most 100. Read 75 and over as sure, 50 to 74 as likely, and less as a hint.
4. A platform that shows itself only after scripts run, or that hides its markers, is not seen: nothing is guessed, and nothing is run or submitted.
5. It is information, so it is never deducted from the score.

## References

- [webappanalyzer: technology fingerprints](https://github.com/enthec/webappanalyzer)
- [MDN: the generator meta tag](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name)

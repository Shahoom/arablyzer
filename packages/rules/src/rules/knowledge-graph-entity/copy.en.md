# Brand in Google's Knowledge Graph

## Messages

### known

Google's Knowledge Graph knows “{name}” (asked in {lang}), for the brand “{brand}”. Types: {types}. Description: {description}. Wikipedia: {wikipedia}.

## Why it matters

- The Knowledge Graph is the database behind the knowledge panel Google shows beside results for a brand, and it is one of the sources the assistants and AI answers draw on to say who a brand is.
- An entity gives Google, and the assistants, one agreed answer to “who is this?” for your name, so your site, profiles and mentions are tied to one thing and not guessed apart.
- Most small sites are not in it, and that is not a fault: it is information about whether Google can tell who you are by name.

## How to fix

There is nothing to fix on a page, and no way to ask Google for an entity. What helps it recognize one:

- Say who you are the same way everywhere: the same name in the site, social profiles, Google Business Profile and directories, in Arabic and in English.
- Add `Organization` structured data with `name`, `url`, `logo` and `sameAs` pointing to your official profiles (and Wikipedia or Wikidata where you have an entry).
- Earn coverage that names you: news, trade directories and a Wikidata item, if you meet its notability bar, are what Knowledge Graph entities usually come from.

## How we detect

1. We take the brand's name from the page: the `name` of an Organization-like object (Organization, Corporation, Store, LocalBusiness, Brand) in its JSON-LD, else the WebSite's, else `og:site_name`, else the first part of the title.
2. With a Google API key, we ask the Knowledge Graph Search API (`entities:search`) for that name twice, in Arabic and in English. The name goes to Google with the key; the page's address does not.
3. An entity counts when its name is the brand's, or starts with it or is started by it (“Acme” and “Acme Inc.”), compared without case, marks, tatweel or spaces. Google also returns near matches of other names, which we do not count.
4. A brand Google does not know has no finding: the report's facts say it is not there. The result is information, never deducted. Without a key, for a page on a private address, or for a page that gives no name, nothing is asked and the rule does not apply; if Google gives no answer, the rule reports that it could not check.

## References

- [Google: Knowledge Graph Search API](https://developers.google.com/knowledge-graph)
- [Google Search Central: Organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization)

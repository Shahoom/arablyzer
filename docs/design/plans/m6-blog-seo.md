# M6: the blog («المقالات») and the SEO layer

Phase 6, on `phase-6/blog-seo`. The static site gets a blog, four comparison pages, a feed pair for
each language, `llms.txt` and the structured data the site was missing. What each part is, where it
lives, and what the owner reads before it goes live.

## 1. The blog

**Where.** Articles are Markdown in `apps/web/src/content/blog/ar/<slug>.md` and
`.../en/<slug>.md`, one Astro content collection (`src/content.config.ts`, schema in
`src/lib/blog-schema.ts`). Arabic is the original: `/blog/<slug>`. An English article is a
translation with the same slug, at `/en/blog/<slug>`, and exists only when someone wrote it: nothing
pairs an article with a translation that is not there (its page names itself and an x-default, and
the language link in the header goes to the other language's blog index).

**Frontmatter.** `title`, `description` (the meta description, at most 200 characters), `summary` (the
line under the title and in the lists, at most 110), `date`, `updated`, `author` (the team by
default), `tags` (from `BLOG_TAGS` in `packages/i18n/src/blog.ts`), `lang`, `draft`, `reviewed` and
the pages the article is about: `tools`, `rules`, `fix`, `terms`, and `related` (other articles).
`lib/blog.ts` throws at build time for a reference that does not exist, so a renamed tool breaks the
build and not a link. The same schema runs in `test/blog.test.ts` over the files.

**Body.** Our strict Markdown (`packages/seo/src/markdown.ts`) plus `## Title {#id}` and
`### Title {#id}` (`packages/seo/src/article.ts`): the author writes the id, the contents list is
exactly those ids, and a link to a section survives a change of its title. A defect shown as an
example (a word stretched with tatweel, Eastern digits, the riyal sign U+20C1) goes in a code span or
is not written at all: the site's own Arabic rules read the page like a visitor's, and the riyal sign
is in none of our fonts.

**Pages.** The index and the tag pages (`components/blog/BlogIndex.astro`: compact rows, a
`scroll-row` of tag chips on a phone and a list in the aside from lg), the article (`BlogPost.astro`
on `DocPage`: contents, tools, rules, guides, terms and related articles in the aside, previous and
next, reading time at 200 words a minute, an author line). A tag has a page once two articles carry
it, in the language of those articles. Tool, rule, guide and term pages list the articles that name
them (`postsAbout`).

**Feeds.** RSS 2.0 and Atom 1.0, one pair for each language (`/blog/feed.xml`, `/blog/atom.xml`,
`/en/blog/...`), linked from the blog's pages and the home page.

**Review.** `reviewed: false` in every article, like the interface copy. `pnpm copy:review` in
`apps/web` lists the articles waiting for the owner and fails until each says `reviewed: true`.

**Left for later.** The knowledge hub's search does not read the articles (a blog search can come
later); the hub's four tiles are unchanged.

## 2. The SEO layer

- **JSON-LD.** Home: `Organization` (with CloudTopia as its parent), `WebSite` with a `SearchAction`
  to the hub's `?q=` search, and `SoftwareApplication`. Tool pages: `FAQPage`, one question in the
  markup for each question the page shows (the audit counts them). Articles: `BlogPosting` with
  author, publisher, both dates, image and word count, and a `BreadcrumbList`. `HowTo` was left out:
  the fix guides are prose, not steps, and Google no longer shows it.
- **Comparisons.** `/compare` and `/compare/<shipwork|seoptimer|seobility|pagespeed-insights>`,
  Arabic and English (`packages/i18n/src/versus.ts`). Every row is something Arablyzer does; a
  competitor's cell says what that tool's own public pages state on `checked` (2026-10-10) and
  otherwise "not stated", never "no". `ItemList` of two `SoftwareApplication`s (an offer only for
  ours). Linked from the footer, «مقارنات».
- **Files.** `llms.txt` (brief, factual, counts from the registries), `robots.txt` (unchanged: the
  sitemap named, reports left readable so their noindex is seen), sitemaps for the blog and the
  comparisons with the real `lastmod` of each article, and each article's languages.
- **IndexNow.** `pnpm build` ends with `indexnow.ts --write-key --on-build`: when the deployment
  sets `ARABLYZER_INDEXNOW_ON_BUILD=1`, a key and a real `ARABLYZER_SITE`, the build tells IndexNow of
  the blog's and the comparisons' addresses; a failed ping is a warning. CI never pings.

## 3. The audit

`auditBuiltSite` knows the new pages: an article and a tag page are in Arabic always and in English
when translated, and the audit holds their hreflang to exactly that; an article needs a BlogPosting,
a `<time>`, `og:type` article; `robots.txt`, `llms.txt` and the feeds are checked (the feeds list each
article, every link in `llms.txt` exists); built files count as link targets. Articles, tags and
comparisons are templates for the slow checks (Lighthouse, the site scanning itself in three
engines): the first of each in each language.

## 4. What the owner reads

The ten articles (`reviewed: false`), the comparison pages' cells (`reviewed: false`, in
`versus.ts`), and the blog's strings (`blog.ts`). Whether to name a person as the author (the team is
named now), and the dates (all 2026-10-10: the day they were written).

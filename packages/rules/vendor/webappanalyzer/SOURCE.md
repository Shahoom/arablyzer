# webappanalyzer fingerprints

`fingerprints.json` is a trimmed subset of the technology fingerprints of
[enthec/webappanalyzer](https://github.com/enthec/webappanalyzer) (the maintained continuation of
Wappalyzer's open-source fingerprints), pinned to commit
`eea872af449e207e055398f7369d11ee48c8ea03` (2026-09-16).

- **Licence:** GNU GPL v3 (`LICENSE` beside this file), which is compatible with Arablyzer's
  AGPL-3.0.
- **Subset:** the categories CMS, Ecommerce, Page builders, Analytics, CDN, JavaScript frameworks,
  Blogs, Web frameworks, Tag managers and WordPress plugins, with the technologies they imply, and of
  each technology only the patterns a scan can read without running the page: `headers`,
  `cookies`, `meta`, `scriptSrc`, `html` and `url`. Icons, descriptions and the patterns that need
  a running page (`js`, `dom`, `css`, `xhr`) are dropped.
- **Update:** change `COMMIT` in `packages/rules/scripts/vendor-platforms.ts` and run it.
- Arablyzer's own fingerprints for Arab platforms are in `src/lib/platforms.ts`, not here.

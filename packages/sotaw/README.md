# @arablyzer/sotaw

«حالة الويب العربي» / State of the Arabic Web (M9): the sample frame, the polite crawl, the aggregation
and the dataset files. The plan and its rules are `docs/design/plans/m9-state-of-arabic-web.md`.

```
pnpm sotaw:frame --list-id Y83YG      # the frame: data/frames/<list id>.csv, .exclusions.csv and .json (no database)
pnpm sotaw:frame --from-frame Y83YG   # the same frame under the current rules, from the committed one
pnpm sotaw:crawl                      # crawl it; needs DATABASE_URL, VALKEY_URL, ARABLYZER_SCANNER_*
pnpm sotaw status                     # how far the run is
pnpm sotaw export --out DIR           # the public files: aggregates (JSON, CSV, Parquet), schema, manifest
pnpm sotaw export --out DIR --internal DIR2   # also sites.parquet, for our own analysis (never public)
```

`crawl`, `status` and `export` run inside the stack's network: `infra/README.md`, «The crawl of the
Arabic web». Settings are `ARABLYZER_SOTAW_*` (`src/config.ts`); the defaults are the gentle ones.

- `data/frames/` the committed sample frames and, for each, the sites left out of it and why
  (`src/exclusions.ts` is the rule: `.ly` single names, named domain hacks, global brands' mirrors);
  `data/opt-out.txt` the domains that asked to be left out.
- The report's figures are of Arabic pages only (`isArabicPage`); the pages on Arab domains that are
  not in Arabic are one figure of their own. The public dataset is aggregates only.
- `src/metrics.ts` the one list of what is measured; the page, the dataset's columns and the JSON
  Schema are read from it.
- `test/services/` run on PostgreSQL and Valkey (`pnpm test:services`, with `ARABLYZER_TEST_DATABASE_URL`
  and `ARABLYZER_TEST_VALKEY_URL`).

# @arablyzer/sotaw

«حالة الويب العربي» / State of the Arabic Web (M9): the sample frame, the polite crawl, the aggregation
and the dataset files. The plan and its rules are `docs/design/plans/m9-state-of-arabic-web.md`.

```
pnpm sotaw:frame --list-id Y83YG      # the frame: data/frames/<list id>.csv and .json (no database)
pnpm sotaw:crawl                      # crawl it; needs DATABASE_URL, VALKEY_URL, ARABLYZER_SCANNER_*
pnpm sotaw status                     # how far the run is
pnpm sotaw export --out DIR           # aggregates (JSON, CSV, Parquet), sites.parquet, schema, manifest
```

`crawl`, `status` and `export` run inside the stack's network: `infra/README.md`, «The crawl of the
Arabic web». Settings are `ARABLYZER_SOTAW_*` (`src/config.ts`); the defaults are the gentle ones.

- `data/frames/` the committed sample frames; `data/opt-out.txt` the domains that asked to be left out.
- `src/metrics.ts` the one list of what is measured; the page, the dataset's columns and the JSON
  Schema are read from it.
- `test/services/` run on PostgreSQL and Valkey (`pnpm test:services`, with `ARABLYZER_TEST_DATABASE_URL`
  and `ARABLYZER_TEST_VALKEY_URL`).

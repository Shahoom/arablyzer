-- Percentiles, across Arab countries' origins, of each origin's 75th percentile of Largest Contentful
-- Paint and Cumulative Layout Shift on phones, from the Chrome UX Report's country summary. Run by
-- scripts/httparchive-benchmark.ts with --parameter=month:INT64:<YYYYMM>
-- NOT yet run against BigQuery: `bq query --dry_run` it first, and check the table's columns
-- (p75_lcp in milliseconds, p75_cls) and its device values.
-- Each list is APPROX_QUANTILES(.., 100): the 101 values from the minimum to the maximum.
SELECT
  COUNT(DISTINCT origin) AS origins,
  APPROX_QUANTILES(p75_lcp, 100) AS lcp,
  APPROX_QUANTILES(p75_cls, 100) AS cls
FROM `chrome-ux-report.materialized.country_summary`
WHERE
  yyyymm = @month
  AND device = 'phone'
  AND country_code IN ('sa', 'ae', 'eg', 'kw', 'qa', 'bh', 'om', 'jo', 'lb', 'iq', 'ma', 'dz', 'tn', 'ly', 'sy', 'ye', 'ps', 'sd')
  AND p75_lcp IS NOT NULL

-- Percentiles of what an Arab-ccTLD page weighs, from the HTTP Archive's monthly crawl (mobile, root
-- pages): bytes, requests and font bytes. Run by scripts/httparchive-benchmark.ts with
--   --parameter=crawl:DATE:<YYYY-MM-01>
-- NOT yet run against BigQuery: `bq query --dry_run` it first, and check the `summary` column's
-- fields against the table's schema (bytesTotal, reqTotal, bytesFont).
-- Each list is APPROX_QUANTILES(.., 100): the 101 values from the minimum to the maximum.
SELECT
  COUNT(*) AS pages,
  APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(summary, '$.bytesTotal') AS INT64), 100) AS weight,
  APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(summary, '$.reqTotal') AS INT64), 100) AS requests,
  APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(summary, '$.bytesFont') AS INT64), 100) AS font
FROM `httparchive.crawl.pages`
WHERE
  date = @crawl
  AND client = 'mobile'
  AND is_root_page
  AND REGEXP_CONTAINS(NET.HOST(page), r'\.(sa|ae|eg|kw|qa|bh|om|jo|lb|iq|ma|dz|tn|ly|sy|ye|ps|sd)$')

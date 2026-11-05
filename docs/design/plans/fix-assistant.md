# Fix assistant — Implementation Plan

> **ملخص للمالك:** مساعد الإصلاح (BUILD-PLAN §12، المرحلة 6): في صفحة التقرير، من سجّل الدخول يضغط «اقترح إصلاحاً بالذكاء الاصطناعي» تحت أي قاعدة فشلت، فيصله شرح عربي وخطوات وتعديل مقترح للكود، موسوم «مولّد بالذكاء الاصطناعي، راجعه قبل أن تطبّقه». يقترح فقط: لا يغيّر مخالفة ولا درجة، ولا أدوات لديه ولا يفتح روابط. **مطفأ بالكامل حتى تضع `ANTHROPIC_API_KEY`**، ولا يبدأ الـAPI بالمفتاح دون سقف شهري للإنفاق (`ARABLYZER_AI_SPEND_MONTHLY`). لا أحد يملكه حتى تعطي الخطة رقماً يومياً (`ARABLYZER_PLAN_ACCOUNT_AI_FIXES_PER_DAY`، أو من لوحة المالك لحساب واحد). الجواب نفسه لنفس الدليل واللغة يُخزَّن 30 يوماً فلا يكلّف مرتين. **ينتظرك:** المفتاح (في مساحة عمل خاصة في Console بحدّ إنفاق)، السقف الشهري، الرقم اليومي للخطة، وقراءة النص العربي الجديد (`reviewed: false`).

**Goal:** On a finished report, a signed-in person asks for a suggested fix of one failed rule. The Claude API writes an explanation (Arabic or English), steps and a patch from the rule's real evidence; it is labelled as AI's, changes no finding and no score, and costs the owner no more than the caps allow.

Design source: BUILD-PLAN §12 (uses, defaults, controls), §3 (the quota is a paid-plan feature), §13. Built beside `m4.3-monitoring.md`'s pattern: an optional feature that is a 404 until its environment is set.

## 0. Decisions

| Question | Decision and why |
|---|---|
| Who may ask | **Signed-in accounts only.** The assistant spends the owner's money. An anonymous visitor has no account to count a number against, only an address, which §14 says is never kept; BUILD-PLAN §3 lists the assistant's quota among the accounts' and Pro's features. Free single-page tools stay free and signup-free: they are untouched. |
| Who has it | A plan number, `aiFixesPerDay` (`ARABLYZER_PLAN_<PLAN>_AI_FIXES_PER_DAY`), **0 when empty**: no plan has the assistant until the owner gives it a number, so a key alone opens nothing. The owner's per-account override (M4.8, also on the admin form) gives one account a number, for testing with a real key before any paid plan exists. The free plan's other limits are not touched. |
| What is asked | One **rule** of a stored report (`POST /api/reports/:id/fix {ruleId, language}`), with up to 5 of its findings. The request carries no text: the evidence is read from the stored report by id, so it cannot be used as a free prompt to the model. Any report one can open by its link works; the limit is the asker's own. |
| The model | `ARABLYZER_AI_MODEL`, default **`claude-opus-5-5`** (the claude-api skill's current default; BUILD-PLAN §12's `claude-opus-5` is the previous one). Thinking is left to the model (on and adaptive for Opus 5.5); `ARABLYZER_AI_EFFORT` is optional and sent only when set (an unsupported effort would be a 400 on some models). No sampling parameters. Cheaper-model choice stays the owner's (§12). |
| Structured output | `output_config.format` JSON schema with `explanation_ar`, `explanation_en`, `steps[]`, `patch`, `confidence`. The requested language's explanation is filled and the other left empty (one language is paid for, and the cache is keyed by language). Validated again by a strict Zod schema; extra fields, wrong types or an empty explanation are a failure that is billed and not stored. Over-long text is shortened; a patch too long is dropped, never cut in the middle of code. |
| Refusals and fallbacks | `stop_reason` is read before the content: `refusal` is a coded 422, `max_tokens` and other stops are a coded 502, both billed (the response used tokens) and not stored. The server-side refusal fallback (`fallbacks`, beta) is **not** used: the rescue bills at another model's rates, which the spend cap could not count exactly, and a fix for a security finding that a classifier declines is better said plainly than answered by a second model. Revisit with the owner if refusals show up in use. |
| Errors | 429/529/5xx/connection errors from the API are `unavailable` (the SDK retries once; an attempt that failed is not billed, so the request's place goes back). 401/403/400 from the API are the same word for the visitor and a line in the log (status only). The log and the answer never hold the key, the request or the API's body. |
| Where the request goes | The SDK's `fetch` is **the egress fetch** (`safeFetch`), as every other outbound request of the API: the egress proxy where the server has one, the address rules, no redirect; the global `fetch` stays off-limits. `baseURL` is the constant `https://api.anthropic.com`, never the environment's. |

## 1. Untrusted input

Everything the scanner copied from the page (a finding's message, address, selector, snippet, values, even the rule's title as stored) is data that someone else controls.

- **The system prompt is one constant**, the same for every request, holding the rules and a paragraph that says what is inside the tags and that none of it is an instruction. Nothing from a report is ever in it.
- **The data is one user message**: our own lines, then `<scan_data>` + JSON + `</scan_data>`. The JSON is built from bounded values (each string cut, at most 20 keys, depth 2, 5 findings, 7,000 characters, and findings dropped from the end, then values, then snippets, so it is always whole JSON), with invisible and direction-changing characters removed, and then **every `<` and `>` in the text is written `<` and `>`**. No tag can be written, closed or forged inside it; look-alike brackets (full-width, angle quotes, mathematical) are made real brackets first so they are escaped too. The rule's id, version, severity and category stand outside the tags and are checked against their shapes.
- **The model can only answer.** The request has no `tools`, no `tool_choice`, no web search or fetch, no thinking or sampling parameters of ours. What it returns is validated, then shown as **text** (never markup) beside the label «AI-generated. Review it before you apply it.»; characters that reorder text are removed from a patch (trojan-source). Nothing it says is used to act, fetch or change a finding or a score.
- **The frozen evaluation set** (`apps/api/test/ai-cases.ts`): seven cases, four hostile (an instruction to ignore the rules, a forged end of the data with a system message, look-alike and invisible closing tags, a break-out of the JSON), one past every size limit. The unit tests run every case against a scripted model and hold what is sent (system prompt equal to the constant, no tool, one pair of tags, no bracket inside them, attacker text nowhere outside), and that an "obedient" model that adds a score or a tool call is refused. `PROMPT_VERSION` and a fingerprint of prompt + schema are pinned in a test: a change to either fails it until the version is raised and the live set is run. `pnpm --filter @arablyzer/api ai:eval` runs the same cases against the real model, by hand, with a key (it spends real money, a few answers).

## 2. Spend and limits

| Control | How |
|---|---|
| Account's day | `aiFixesPerDay` requests in any 24 hours, counted from the ledger; a stored answer and a failed request count for none; the 429 says in `retryAfterSeconds` when a slot frees. |
| Waiting requests | At most `ARABLYZER_AI_MAX_PENDING` (2) per account at once. |
| Spend caps | `ARABLYZER_AI_SPEND_MONTHLY` (required with the key) and `_DAILY` (optional), in the unit the prices are in (US dollars on Anthropic's bill), calendar month and day in UTC, counted globally (the owner's wallet) in micro-units. |
| No overshoot | **Reserve, then settle.** Before the model is asked, a request takes its place in `ai_requests` with its worst cost (input at the dearer of the input and cache-write price at half a token per byte, plus `max_tokens` at the output price). The account's count, its waiting requests and both caps are checked and the row inserted **under one advisory lock in one transaction**, so requests at once cannot pass any of them, not even by one request. The response's `usage` (input, output, cache reads, cache writes) settles it at its real cost. A request that never settled (a crash) holds its place at its worst for 10 minutes and is then forgotten. |
| Prices | `ARABLYZER_AI_PRICE_INPUT`/`_OUTPUT`/`_CACHE_READ`/`_CACHE_WRITE`, units per million tokens. The defaults are the claude-api skill's published prices for the default model only (4, 20, 0.2, 5); any other model **must** set input and output or the API does not start, and its cache prices default to the published multipliers (0.1× and 1.25× input). |
| Fail-closed | With the key set, a missing monthly cap, a cap below the daily, a malformed number, an unknown effort or a missing store stops the start. With the key empty, none of it is read. |

## 3. Files

| Path | Responsibility |
|---|---|
| `packages/plans/src/{account-plan,overrides}.ts` | `aiFixesPerDay` (optional variable, 0), and as an override (0 to 1,000) |
| `packages/store/src/{ai,postgres/ai-schema,postgres/ai-store}.ts`, `drizzle/0013_ai_fixes.sql` | `AiData`: ledger (`ai_requests`: reserve, settle, release, counts, spend) and answer cache (`ai_fix_cache`), memory and PostgreSQL over one contract suite |
| `packages/api-contract/src/{codes,index}.ts` | paths, `AiStatus`, `AiFix`, error codes, `AiFixRequest` |
| `apps/api/src/ai/{settings,prompt,answer,cost,client,assistant,routes}.ts` | the environment, the prompt and the evidence, the answer's shape, prices, the SDK on the egress fetch, the flow, the two routes |
| `apps/api/src/{config,app,accounts,server,dev,maintenance,ids}.ts`, `admin/views.ts` | wiring, the 90-day sweep of the ledger, the admin form's field |
| `packages/i18n/src/ai.ts` (+ admin copy) | AR+EN copy, `reviewed: false` |
| `apps/web/src/islands/{ai-model,ai-api}.ts`, `report/FixAssistant.tsx`, `report/Findings.tsx` | the button under each failed rule's «how to fix», the result |
| `apps/api/test/ai-*.test.ts`, `ai-cases.ts`, `scripts/ai-eval.ts`, `apps/web/test/ai-api.test.ts`, `test/browser/account.browser.test.ts` | tests |
| `infra/{compose.yaml,.env.example,README.md}`, `docs/deploy/staging.md` | variables and runbook |

## 4. Contracts

| Route | Guards | Success | Refusals |
|---|---|---|---|
| `GET /api/ai` | session | `{available, perDay, used}` | 401; 404 where there is no key |
| `POST /api/reports/:id/fix {ruleId, language}` | Origin, JSON, session | 200 `{ruleId, language, explanation, steps[], patch, confidence, cached}` | 400, 401, 403 `plan-limit` (`aiFixesPerDay`), 404 (no such report or rule, or the rule did not fail), 422 `refused`, 429 `rate-limited` (+ `Retry-After`), 502 `failed`, 503 `unavailable` / `budget` |

## Acceptance criteria

1. Without `ANTHROPIC_API_KEY`: both routes 404, nothing is read, the API starts; the report page shows no button.
2. With it and a plan number: a signed-in account gets a suggestion for a failed rule, labelled; the same evidence again costs nothing and uses none of the day; the (N+1)th is a 429 with when to come back; a spend cap that cannot take the request's worst case is a 503 `budget` before the model is asked; twelve concurrent requests on separate connections pass a cap by none.
3. No text of a page reaches the system prompt; the data holds no angle bracket; the request has no tool; an answer that is not exactly the schema is refused and not stored.
4. `pnpm lint`, `format:check`, `typecheck`, unit and service tests, the browser test of the report page pass.

## Not in this plan

The error explainer (BUILD-PLAN §12 use 2), the annual-crawl classifier and the Batch API (use 3, v3), the refusal fallback, a per-account spend cap, a cheaper-model cascade, streaming the answer, payments and any pricing page, and any page of the signed-in dashboard (PR #82).

## For the owner

1. `ANTHROPIC_API_KEY`: an Anthropic Console account, a **workspace of its own** for Arablyzer with a spend limit there too (the caps here count what this server asks; the Console limit is the second fence), and a key in that workspace. (`ARABLYZER_ANTHROPIC_KEY`, used by the AI visibility tool, is a different variable; it may be the same account but a different workspace.)
2. `ARABLYZER_AI_SPEND_MONTHLY` (required with the key) and, if wanted, `ARABLYZER_AI_SPEND_DAILY`, in US dollars. One suggestion costs at most about 15 cents at the default model and limits, usually a few cents.
3. The plan's daily number (`ARABLYZER_PLAN_ACCOUNT_AI_FIXES_PER_DAY`), or, to try it first, the number on your own account in the admin panel's override form.
4. The Arabic of the button, the label and the errors (`packages/i18n/src/ai.ts`, `reviewed: false`).
5. Decide later whether to cheapen the model (`ARABLYZER_AI_MODEL` with its prices) after the live evaluation (`pnpm --filter @arablyzer/api ai:eval`) on a sample.

## Record

**Built (branch `feat/fix-assistant`).** Behind `ANTHROPIC_API_KEY` and `ARABLYZER_ACCOUNTS=on`; see the tables above.

- `packages/plans`: `aiFixesPerDay`, 0 by default, from `ARABLYZER_PLAN_ACCOUNT_AI_FIXES_PER_DAY` (and the paid plans' names); an override field, with the admin form's input and the settings and plan rows.
- `packages/store`: migration `0013_ai_fixes` (`ai_requests`, `ai_fix_cache`); `AiData` in memory and PostgreSQL over one contract suite, including twelve requests at once on separate connections. The worker's role has no right on either table. `user_id` is set null on erasure and the cost stays.
- `apps/api`: the assistant and its two routes; `@anthropic-ai/sdk` on the egress fetch; the ledger swept at 90 days with the accounts' tables.
- `apps/web`: `FixAssistant` under each failed rule's «how to fix», shown only when `GET /api/ai` says available; its text is text.

**Checked by hand.** The browser test of the report page in Chromium (button absent where there is no assistant, a suggestion with its label, a tag in the answer shown not drawn, the errors in both languages), and one screenshot each way.

**Not tested with a real key** (no account yet): the live request to `api.anthropic.com` through the egress proxy; that the model's structured output matches the schema in practice; the real quality of Arabic answers, and refusals in practice; `ai:eval`; the real size of `usage` against the worst-case estimate. Everything between the SDK and the network is tested with the SDK's own client over the egress fetch and a scripted fetcher.

**Moves when PR #82 (the `/app` dashboard) merges.** Nothing of this feature is on a `/app` page: it is on the report page (`/r/:id`), which the dashboard does not replace. When the dashboard lands: the usage line (`used of perDay`) belongs in the dashboard's plan and usage view (`GET /api/ai` answers it), and the owner's override stays on the admin panel.

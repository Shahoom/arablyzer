# M7: deep Arabic («العربي العميق»)

Issue #40. A language service built on CAMeL Tools, a spelling rule that reports only what it is sure of, a dialect model beside the dialect word list, the Gulf pack of `country-fit`, and two tool pages. The words are Arabic first and `reviewed: false` until the owner reads them.

## 1. What it is

```text
scanner ──(page text, after the render)──┐
                                          ├─► arabic-nlp   (scan network only, no way out)
worker ◄── BullMQ ◄── API (text tools) ───┘      /spell  /dialect  /analyze  /health
```

- `services/arabic-nlp`: Python 3.12, FastAPI on uvicorn, one process. CAMeL Tools' morphology analyzer over two databases and its six-way dialect model, loaded once at start. Hash-pinned requirements, data baked in at build and checked against locked checksums, non-root, read-only filesystem, all capabilities dropped, no network at run time (the `scan` network is internal), no text kept or logged.
- `ar-spelling` (new rule, moderate): the slips the service is sure of, in the page's visible body text.
- `dialect-register` 1.1.0: reads the model's verdict where the word list finds nothing; the word list is the fallback and still decides where it finds a dialect.
- Gulf pack: three new items in `country-fit` 1.1.0 (§6).
- Tools «المدقق الإملائي العربي» (`arabic-spell-check`) and «كاشف اللهجة» (`dialect-detector`): a pasted text or a page's address.
- A scan **never** fails because of the service. Not configured: the rules are not applicable, no notice. Configured and down, slow (6 s for both asks), refusing (503 `busy`) or answering nonsense: notice `nlp-unavailable`, the rules are not applicable, the dialect rule reads its word list, and the service is not asked again for 20 s (a service that is down costs the next scans nothing).

Where each piece is: `services/arabic-nlp/` (service, `tests/`, `tools/evaluate*.py`, `data.lock.json`); `packages/collectors/src/nlp.ts` (types and the client, which the engine and the worker share); `packages/engine/src/nlp.ts` and `scan.ts` (the ask after the render); `packages/rules/src/rules/ar-spelling/`, `lib/gulf.ts`, `lib/dialect.ts`; `fixtures/src/nlp.ts` (stand-in service); `apps/api/src/nlp/`, `apps/worker/src/nlp.ts`, `packages/store/src/nlp-queue.ts` (the text tools); `apps/web/src/islands/nlp/NlpPaste.tsx`; `infra/compose.yaml` (service `arabic-nlp`); the CI job `arabic-nlp`.

**Why the text tools go through the worker.** The service is on `scan` alone, as asked. The API is on `edge` and `data`, so it cannot reach it, and joining it to `scan` would put the internet-facing process beside the scanner. The worker is the one process on both `data` and `scan`: the API adds a BullMQ job (the pasted paragraphs, the kind, the sensitivity) and waits at most 15 s for the worker's return value; the job is removed 30 s after it ends, so a pasted text is in Valkey for seconds. Each request takes a scan of the visitor's quota and its Turnstile token, as the search tools do (`apps/api/src/take-scan.ts` is the code both share).

## 2. Data licenses (blocking, checked first)

CAMeL Tools' code is MIT; its data packages differ. Each package was read from the maintainers' catalogue (`camel-tools-data/catalogue-1.6.json`, 2026-10-16) and its own `LICENSE` file after download; the per-file SHA-256 of every unpacked file equals the catalogue's.

| Package (version) | License | Used for | Commercial use |
| --- | --- | --- | --- |
| CAMeL Tools 1.6.0 (code) | MIT | analyzer, dediacritizer, dialect model loader | yes |
| `morphology-db-msa-r13` = CALIMA MSA r13 (0.4.0) | **GPL v2** (the file says: derived from AraMorph 1.2.1, distributed under GPL v2) | which spellings a word has, how likely each reading is | yes: see below |
| `morphology-db-glf-01` = CALIMA Gulf 01 (0.1.0) | **CC BY 4.0** | whether a word is known to the Gulf lexicon | yes, with attribution (the tool pages, the rule page and the image's `LICENSE` carry it) |
| `dialectid-model6` (1.1.2) | MIT (catalogue) | the dialect model: Beirut, Cairo, Doha, Rabat, Tunis, Modern Standard | yes |
| `camel-kenlm` 2026.2.7 | LGPL v2.1/3 (KenLM) | the dialect model's language models | yes, unmodified and dynamically loaded |

Every other Python dependency is MIT, BSD, Apache-2.0, PSF, or MPL-2.0 (certifi, tqdm: file-level copyleft, unmodified); `services/arabic-nlp/THIRD_PARTY.md` lists them. A test (`test_licenses.py`) holds `data.lock.json` to an allow-list of licenses that permit commercial use.

**GPL v2 and the paid plans.** The GPL permits commercial use, including selling a service. Its conditions bind *distribution* of the database and of works derived from it. Arablyzer runs the database unmodified in a container of its own, behind an HTTP API, and distributes neither the database nor the image (the `Dockerfile` fetches the packages from the maintainers at build, by checksum; the repository holds a lock, not the data). The repository itself is AGPL-3.0, whose terms apply to the service's own code. **If the owner ever publishes the image, the GPL obliges them to offer the database's source** (it is public, at the URL in the lock); say so before doing it. If the owner prefers no GPL at all, the service starts without the MSA database only with a code change (the check is built on it): see §7.

**Left out on purpose.** `morphology-db-msa-s31` (LDC licence, not for commercial use); `disambig-mle-calima-msa-r13` (GPL v2, 88 MB, not needed: the likelihoods come from the database's own log probabilities); `morphology-db-egy-r13` (GPL v2) and `-lev-01` (CC BY): memory for little, dialect words are handled by a short hand-written list instead; `dialectid-model26`: finer than the five varieties the product reports; the BERT disambiguators, NER and sentiment models (hundreds of MB, torch, and AraBERT's licence is not a clear yes).

## 3. Resources (measured)

`docker stats` on the arm64 Docker of the development machine, after the data was loaded and after the worst cases below; and on amd64, which is what CI and the server run, in the job `arabic-nlp` (the same pytest results and precision, bit for bit).

| | Measured |
| --- | --- |
| Image | 644 MB on amd64 (CI), 926 MB on arm64 (runtime): Python 3.12 slim, the venv (scipy, pandas, scikit-learn, numpy, kenlm), the data (141 MB) |
| Start | 3 s to load the databases and the model; `/health` answers 503 `loading` until then |
| Memory, idle after load | 637 MiB (arm64) and 637.7 MiB (amd64, CI) |
| Memory after 60,000 characters of unknown words (the worst case, 7.9k words, ~4.2 s) three times, then six such requests at once | 660 MiB |
| One CPU | a 60,000-character text of ordinary words: 0.06 to 0.9 s; of unknown words: 4.1 to 4.5 s; six at once: two in 4.4 s, the other four cut at the 8 s deadline (`truncated: true`) |
| Compose limits | `mem_limit: 1g` (660 MiB measured, room for the 50,000-word cache), `cpus: 1`, `pids_limit: 128` |

Bounds: 400 texts of 5,000 characters, 60,000 in all, a 256 KB body; 8 s per request (the answer is what is done, marked `truncated`); 2 requests worked on at once and 4 waiting, then 503 `busy`. The scanner sends at most 300 texts and 50,000 characters, asks for at most 6 s, and does not ask again for 20 s after a failure. The memory caps of the stack, with the new 1 GiB, are 3,504 MiB with one scanner, inside the 3.5 GB of BUILD-PLAN §18.3.1.

## 4. Accuracy policy for `ar-spelling`

**Precision first.** A word is reported only when the CALIMA MSA database knows it as a variant of another spelling and as nothing else (the hamza left off, ه for ة, ي for ى), the written form is no word of its own, the lexeme has been counted (the database's log probability is not "never seen"), and the fix is clearly the likelier (the second spelling is under half as likely, else the confidence falls). Left alone: names, brands and foreign words (the best reading is a proper noun, a foreign word or an abbreviation, or the lexeme is unattested); Gulf, Egyptian, Levantine and Maghrebi speech (the Gulf lexicon, a hand-written list in `dialect_words.py`); verbs that may be a command with no hamza («احصل», «اطلب», «اضغط»: a Form I verb as likely as the Form IV reading); marked (vowelled) words; letters stretched three times; quotations in « », “ ” or " "; addresses; words glued to Latin letters or digits; the page's own brand names (`brand-names.ts`). A hamza that was written is never changed to another, and ة is never turned into ه (the database may only lack the word).

**Families**, each with its own evidence: hamza (`ا` for أ إ آ; و for ؤ; ي ى for ئ); ta marbuta (ه for ة; also «ميزه جديدة», where an adjective ending in ة with no «ال» after a noun ending in ه says the noun is feminine); alef maqsura (ي for ى and the reverse: «مستشفي», «فى»); tanween («مرةاً», «كثيرً»; «شكراً» and «شكرًا» are right); typo (a doubled letter, a hamza seat, a swap, capped below the default threshold except the doubled letter: 0.92); phrase («انشاء الله», «ان شاء الله» → «إن شاء الله»; «إنشاء الله» is held at 0.86, under the default, because it may mean "the creation of God"). A short hand-written list of the common comparatives («أفضل», «أسرع», «أحدث»…) is treated as hamza slips without the imperative guard.

**Confidence** is a formula, not a calibrated probability: the family's base (0.97 hamza and ta marbuta, 0.95 alef maqsura) times a dominance factor (1 when the second spelling is under half as likely, falling to about 0.45 when they tie), times 0.9 when more than two letters change; medial hamza fixes need a lexeme with log probability above −4.5. The service reports findings at or above `min_confidence` (0.9, `ARABLYZER_SPELLING_MIN_CONFIDENCE`, never below 0.5).

**Measured** on 298 labelled sentences written for this (`services/arabic-nlp/tests/fixtures/spelling-*.jsonl`: self-written, no scraped text; 107 labelled slips, the rest clean sentences with the traps above). A finding is right only when the word and the suggestion are the labelled ones. At the default 0.9:

| Split | What it was for | Sentences | Slips | Reported | Right | Precision (Wilson 95%) | Recall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dev | the formula was built and tuned on it | 98 | 47 | 42 | 42 | 100% (92 to 100) | 89% |
| test | written after the formula was fixed; **first run 21 of 24 right (87.5%)**, which showed three real faults (the direction of ة/ه, a hamza changed to another hamza, the suggestion for «الي»); fixed in principle, re-run: 24 of 24, no longer blind | 102 | 29 | 25 | 25 | 100% (87 to 100) | 86% |
| holdout | written after those fixes, run once: **23 of 24 right (95.8%, 80 to 99)**, recall 74%; the one wrong is «ارفاق» (a real slip, suggested «أرفاق», not «إرفاق»). A mislabel of mine («ارسل» is a slip: Form IV commands keep the hamza) was corrected from grammar, not from the output. Then the comparatives list was added for recall (recall only: 26 of 27, recall 84%) | 98 | 31 | 24 (27) | 23 (26) | 95.8% (80 to 99) | 74% (84%) |
| all | | 298 | 107 | 94 | 93 | 98.9% (94 to 99.8) | 87% |

**The number to expect on a page is the holdout's: about 96% right, and with that few findings the interval is wide (80 to 99%).** The all-split figure is flattered by the splits the formula was tuned on. Recall is low by design: 74% to 89% on the splits, 87% over all. By family, over all: hamza 47 of 52, ta marbuta 31 of 37, alef maqsura 6 of 8, tanween 2 of 2, typo 1 of 2, phrase 6 of 6. What it misses: an indefinite ه the sentence does not explain («مناسبه» may be «مناسب» with "his"), «مبني», a transposition («مسوؤل»), a missing letter («المعلوات»). The sentences are the author's, in commercial and formal register with some Gulf speech; real pages have more names, more dialect and more markup, and the first reports from the live site are the real test. `python tools/evaluate.py --split all --min 0.9 --list-fp` shows every wrong finding.

**Threshold.** Over all 298 sentences 0.8, 0.85 and 0.9 report the same 94 findings, 0.95 drops nine of them (one wrong), and 0.7 adds two (one right, one wrong): the formula's scores are bimodal, so the default is not a knife edge. The typo family sits below 0.9 by construction. The owner can lower it in `.env`; the `wide` setting of the paste tool asks at 0.7 and marks those "likely".

**Dialect model.** 50 self-written sentences, ten for each of the five varieties (`tests/fixtures/dialect.jsonl`): 49 of 50 right each alone (the one wrong is an Egyptian sentence read as Gulf); ten pages of five sentences, 10 of 10. These sentences are marker-rich; mixed or mostly Modern Standard pages are harder, which is why the page-level verdict asks for 70% of the probability and half of the sentences, and why the word list still decides where it finds a dialect.

## 5. Dialect

`/dialect` splits the text into sentences (8 to 60 words), the model reads each, and the probabilities are summed weighted by words (Rabat and Tunis are one: Maghrebi; Iraqi sounds Gulf to it). `effectiveDialect`: the word list wins where it found a dialect (3 telling words and a fifth of all); where it found Modern Standard or nothing and the page has 80 Arabic words, the model's verdict is used when one variety holds 70% of the probability and wins half of the sentences. The report's `facts.dialect` keeps the word list's mix, and adds `source` and the model's shares. A new message `model-<dialect>` says a dialect not the country's was found by the model. Without the service nothing changes.

## 6. Gulf pack

`lib/gulf.ts`, fed into `country-fit` (no second rule), for SA, AE, KW, QA, BH, OM. Each item is judged only on what the page writes.

| Item | Judges | Basis |
| --- | --- | --- |
| `vat` (existing, now also BH and OM) | prices shown with no tax statement | VAT is charged in SA, AE, BH, OM |
| `vat-rate` | a rate stated beside «ضريبة القيمة المضافة» or VAT against the country's: SA 15%, AE 5%, BH 10%, OM 5% (KW and QA charge none) | the tax authorities' published rates, as known at this writing; the table is `VAT_RATES`, to be changed with the law |
| `weekend` | opening hours that close Sunday (or work Monday to Friday) in SA, KW, QA, OM, BH, where the weekend is Friday and Saturday; the UAE (Saturday and Sunday since 2022, businesses differ) is not judged | |
| `phone-shape` | a number written with the country's code: digit count (SA 9; AE 8 or 9; KW, QA, BH, OM 8) and no trunk 0 after the code | national numbering plans |
| `currency`, riyal sign, `hijri`, `phone`, `digits` (existing) | | `country-fit` §3 of `arabic-native.md`; decimals of KWD, OMR, BHD are `price-decimals`' |

**Vocabulary («توصيل/شحن», «سلة/عربة») is not a rule.** It was measured before being written: the Arabic home pages of the Gulf stores that answer a plain request (2026-10-16) use both words: Amazon.sa «عربة» (2), Extra «سلة» (2) and «عربة» (1), IKEA «سلة» (1); «توصيل» outnumbers «شحن» where either appears (Extra 6 to 0, Amazon.sa 4 to 2, IKEA 11 to 0), and the other stores block the request or build the page with scripts. There is no preference to hold a page to. If the owner has a vetted list, `lib/gulf.ts` is where an item for it goes. The right-to-left number-and-currency order is judged by `price-format-check` and `bidi-isolation-check`, which exist.

## 7. What it does not do, and the owner's choices

- **GPL v2 database.** §2. If the owner will not run GPL data even as a private service, the spelling check cannot be built on a permitted lexicon today: the Gulf database (CC BY) alone knows too few Modern Standard words (it flagged them as unknown in the first trial), and the dialect model and word list would remain. Say so and `ar-spelling` is switched off with `ARABLYZER_NLP_URL=` empty.
- **Severity.** `moderate`, as the brief; a wrong finding costs a score deduction. `minor` or `info` is one word in `rule.ts`.
- **The Arabic copy** of the rule, the two tools, the card and the paste islands is `reviewed: false`.
- **Cost:** none per scan (no outside service). Server: 1 GiB and one CPU for the service, while a scan's ask adds about a second.

## 8. How to run it

```bash
docker build --target test -t arabic-nlp:test services/arabic-nlp
docker run --rm --read-only --tmpfs /tmp --network none arabic-nlp:test                     # pytest
docker run --rm --read-only --tmpfs /tmp --network none arabic-nlp:test python tools/evaluate.py --split all --list-fp
docker run --rm --read-only --tmpfs /tmp --network none arabic-nlp:test python tools/evaluate_dialect.py
python3 services/arabic-nlp/tools/check_golden.py --url http://127.0.0.1:8790               # golden answers vs the service
```

The golden pages `71-spelling-wrong` and `72-spelling-right` carry the real service's answers in their `site.json`, recorded with `check_golden.py --write` and held to the service by CI; the golden reports come from CI's `golden-actual` artifact like the others.

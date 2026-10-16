# arabic-nlp

Arablyzer's Arabic language service: CAMeL Tools' morphology databases and dialect model behind a small API. Design, licenses, measured memory and precision: [`docs/design/plans/m7-deep-arabic.md`](../../docs/design/plans/m7-deep-arabic.md).

| Endpoint | In | Out |
| --- | --- | --- |
| `GET /health` | | `{"status":"ok"}` once the data is loaded (503 `loading` before) |
| `POST /spell` | `{"texts":[…], "min_confidence": 0.9}` | slips: word, suggestion, family, confidence, context |
| `POST /dialect` | `{"texts":[…]}` | the label, the probabilities of the five varieties, the sentences each won |
| `POST /analyze` | `{"texts":[…]}` | tokens: lemma, root, part of speech where the databases have them |

Caps (environment, with defaults): 400 texts, 5,000 characters each, 60,000 in all, 256 KB body, 8 s a request, 2 working and 4 waiting. Errors are `{"error": code}`: 413 `too-large`, `too-many-texts`, `text-too-long`; 422 `bad-request`; 503 `busy`; 504 `timeout`.

```bash
docker build --target test -t arabic-nlp:test .   # fetches and checks the data packages
docker run --rm --read-only --tmpfs /tmp --network none arabic-nlp:test
```

No text is logged or kept; nothing is fetched at run time; the image is not published (the data is GPL v2).

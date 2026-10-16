# Third-party software and data

Arablyzer's own code in this directory is AGPL-3.0 (the repository's license). It runs with:

## Data (fetched at build from https://github.com/CAMeL-Lab/camel-tools-data, locked in `data.lock.json`)

| Package | License | Notice |
| --- | --- | --- |
| CALIMA MSA r13 (`morphology-db-msa-r13` 0.4.0) | GPL v2 | Derived from AraMorph 1.2.1 (GPL v2, Linguistic Data Consortium). Used unmodified, as a database a separate service reads; not distributed by Arablyzer. Its `LICENSE` is in the image at `/opt/arabic-nlp/camel/data/morphology_db/calima-msa-r13/`. Source: the URL in the lock. |
| CALIMA Gulf 01 (`morphology-db-glf-01` 0.1.0) | CC BY 4.0 | © CAMeL Lab, New York University Abu Dhabi. https://creativecommons.org/licenses/by/4.0/. Used unmodified. |
| CAMeL dialect ID, 6 labels (`dialectid-model6` 1.1.2) | MIT | © CAMeL Lab, New York University Abu Dhabi. |

## Code (pinned with hashes in `requirements.txt` and `requirements-camel.txt`)

CAMeL Tools 1.6.0 (MIT, CAMeL Lab); camel-kenlm 2026.2.7 (LGPL v2.1 and v3: KenLM, Kenneth Heafield; unmodified, a shared library the Python extension loads); FastAPI, Starlette, anyio, pydantic and its core, typing-extensions, typing-inspection, annotated-types, annotated-doc, h11, click (MIT, BSD-3-Clause, PSF); uvicorn (BSD-3-Clause); numpy, scipy, scikit-learn, pandas, joblib, threadpoolctl, python-dateutil (BSD-3-Clause or 0BSD/MIT); dill, cloudpickle (BSD-3-Clause); cachetools, docopt, editdistance, muddler, pyrsistent, six, narwhals, charset-normalizer, urllib3, idna (MIT or BSD); emoji (BSD); regex, requests, opentelemetry-api (Apache-2.0); certifi, tqdm (MPL-2.0, unmodified).

The self-written test sentences in `tests/fixtures/` are this project's.

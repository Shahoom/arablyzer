"""Measures the dialect model on the hand-written sentences: each alone, and in pages of five.

    python tools/evaluate_dialect.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'src'))

from arabic_nlp.config import Settings  # noqa: E402
from arabic_nlp.dialect import VARIETIES, CamelDialectModel, classify  # noqa: E402


def main() -> None:
    model = CamelDialectModel(Settings.from_env().data_root)
    rows = [json.loads(line) for line in (ROOT / 'tests' / 'fixtures' / 'dialect.jsonl').read_text(encoding='utf-8').splitlines()]
    far = time.monotonic() + 120
    confusion: dict[str, dict[str, int]] = {a: dict.fromkeys(VARIETIES, 0) for a in VARIETIES}
    for row in rows:
        result = classify([row['text']], model, far)
        confusion[row['label']][result.label or 'none'] += 1
    right = sum(confusion[v][v] for v in VARIETIES)
    print(f'sentences: {right}/{len(rows)} = {right / len(rows):.3f}')
    for variety in VARIETIES:
        print(f'  {variety:<10}', confusion[variety])
    pages = 0
    page_right = 0
    for variety in VARIETIES:
        own = [row['text'] for row in rows if row['label'] == variety]
        for start in (0, 5):
            result = classify(own[start : start + 5], model, far)
            pages += 1
            page_right += result.label == variety
            print(f'  page {variety}[{start}]: {result.label} {result.probabilities}')
    print(f'pages of five: {page_right}/{pages}')


if __name__ == '__main__':
    main()

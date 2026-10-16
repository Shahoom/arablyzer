"""Measures the spelling check on the hand-labelled sentences and prints precision and recall at each
threshold (docs/design/plans/m7-deep-arabic.md, "Accuracy policy").

    python tools/evaluate.py [--split dev|test|holdout|all] [--min 0.9] [--list-fp]

A finding is right when its word and its suggestion are the labelled ones; a finding on a word that is
not labelled, or with another suggestion, is a false positive. Intervals are Wilson's, at 95%.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'src'))

from arabic_nlp.config import Settings  # noqa: E402
from arabic_nlp.lexicon import CamelLexicon  # noqa: E402
from arabic_nlp.spell import check_texts  # noqa: E402

THRESHOLDS = (0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95)


def wilson(hits: int, total: int, z: float = 1.96) -> tuple[float, float]:
    if total == 0:
        return (0.0, 1.0)
    p = hits / total
    denom = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denom
    margin = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denom
    return (max(0.0, centre - margin), min(1.0, centre + margin))


def load(split: str) -> list[dict]:
    rows: list[dict] = []
    for file in sorted((ROOT / 'tests' / 'fixtures').glob('spelling-*.jsonl')):
        for line in file.read_text(encoding='utf-8').splitlines():
            row = json.loads(line)
            if split in ('all', row['split']):
                rows.append(row)
    return rows


def measure(rows: list[dict], lexicon: CamelLexicon, minimum: float) -> dict:
    tp = fp = fn = wrong_suggestion = 0
    false_positives: list[str] = []
    missed: list[str] = []
    by_family: dict[str, list[int]] = {}
    for row in rows:
        report = check_texts([row['text']], lexicon, min_confidence=minimum, max_findings=1000,
                             deadline=time.monotonic() + 60)
        labelled = {e['wrong']: e for e in row['errors']}
        # A labelled word counts once for each time the sentence writes it.
        wanted = {wrong: row['text'].count(wrong) for wrong in labelled}
        matched: dict[str, int] = {}
        for finding in report.findings:
            error = labelled.get(finding.word)
            if error is not None and error['right'] == finding.suggestion:
                tp += 1
                matched[finding.word] = matched.get(finding.word, 0) + 1
                by_family.setdefault(error['family'], [0, 0])[0] += 1
            else:
                fp += 1
                if error is not None:
                    wrong_suggestion += 1
                false_positives.append(f"{row['id']} {finding.word} -> {finding.suggestion} ({finding.family} {finding.confidence})")
        for wrong, error in labelled.items():
            by_family.setdefault(error['family'], [0, 0])[1] += wanted[wrong]
            for _ in range(wanted[wrong] - matched.get(wrong, 0)):
                fn += 1
                missed.append(f"{row['id']} {wrong} -> {error['right']} ({error['family']})")
    return {'tp': tp, 'fp': fp, 'fn': fn, 'wrong_suggestion': wrong_suggestion,
            'false_positives': false_positives, 'missed': missed, 'by_family': by_family}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--split', default='dev', choices=('dev', 'test', 'holdout', 'all'))
    parser.add_argument('--min', type=float, default=0.9)
    parser.add_argument('--list-fp', action='store_true')
    parser.add_argument('--list-missed', action='store_true')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    settings = Settings.from_env()
    lexicon = CamelLexicon(settings.data_root)
    rows = load(args.split)
    labelled = sum(r['text'].count(e['wrong']) for r in rows for e in r['errors'])
    summary = []
    for threshold in THRESHOLDS:
        m = measure(rows, lexicon, threshold)
        reported = m['tp'] + m['fp']
        low, high = wilson(m['tp'], reported)
        summary.append({'threshold': threshold, 'reported': reported, 'tp': m['tp'], 'fp': m['fp'],
                        'precision': round(m['tp'] / reported, 3) if reported else None,
                        'precision_95': [round(low, 3), round(high, 3)],
                        'recall': round(m['tp'] / labelled, 3) if labelled else None})
    chosen = measure(rows, lexicon, args.min)
    if args.json:
        print(json.dumps({'split': args.split, 'sentences': len(rows), 'labelled_errors': labelled,
                          'clean_sentences': sum(1 for r in rows if not r['errors']), 'thresholds': summary,
                          'chosen': {k: v for k, v in chosen.items() if k not in ('false_positives', 'missed')}},
                         ensure_ascii=False, indent=2))
        return
    print(f"split={args.split} sentences={len(rows)} labelled_errors={labelled}")
    for row in summary:
        print(f"  >= {row['threshold']:<5} reported={row['reported']:<3} tp={row['tp']:<3} fp={row['fp']:<3} "
              f"precision={row['precision']} {row['precision_95']} recall={row['recall']}")
    print('by family at', args.min, {k: f'{v[0]}/{v[1]}' for k, v in chosen['by_family'].items()})
    if args.list_fp:
        print('\n'.join(['false positives:'] + chosen['false_positives']))
    if args.list_missed:
        print('\n'.join(['missed:'] + chosen['missed']))


if __name__ == '__main__':
    main()

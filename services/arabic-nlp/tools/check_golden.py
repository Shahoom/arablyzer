"""The golden pages' recorded answers against the real service (stand-library only; the service must run).

The golden reports are made offline, in the scanner image, with a stand-in for this service (fixtures/src/nlp.ts)
that answers what site.json of each page says. Those answers must be the service's own, so this script sends the
texts of each page (as packages/engine/src/nlp.ts picks them) to the service and compares what comes back.

    python tools/check_golden.py [--url http://127.0.0.1:8790] [--write] [sites-dir]

`--write` records the service's answers into site.json instead of comparing, for a page that has an `nlp` entry
(or `--add` for a page that has not).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

SKIP = {'script', 'style', 'noscript', 'template', 'textarea', 'iframe', 'object', 'title', 'head'}
CODE = {'code', 'pre', 'kbd', 'samp', 'tt', 'var'}
ARABIC = re.compile('[ء-يٱ-ۓ]')
MAX_TEXT = 4000


class Texts(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth: list[str] = []
        self.found: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ANN001
        if tag not in ('meta', 'link', 'br', 'img', 'input', 'hr'):
            self.depth.append(tag)

    def handle_endtag(self, tag: str) -> None:
        while self.depth:
            if self.depth.pop() == tag:
                break

    def handle_data(self, data: str) -> None:
        if any(tag in SKIP or tag in CODE for tag in self.depth):
            return
        text = re.sub(r'\s+', ' ', data).strip()[:MAX_TEXT]
        if len(ARABIC.findall(text)) >= 3 and text not in self.found:
            self.found.append(text)


def texts_of(html: str) -> list[str]:
    parser = Texts()
    parser.feed(html)
    return parser.found


def post(url: str, path: str, body: dict) -> dict:
    request = urllib.request.Request(url + path, data=json.dumps(body, ensure_ascii=False).encode(), method='POST',
                                     headers={'content-type': 'application/json'})
    with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310
        return json.loads(response.read())


def same(a: object, b: object) -> bool:
    """Equal, but for the last digits of a float: another CPU may round a probability differently."""
    if isinstance(a, float) or isinstance(b, float):
        return isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) <= 0.002
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[key], b[key]) for key in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    return a == b


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('sites', nargs='?', default=str(Path(__file__).resolve().parents[3] / 'fixtures' / 'golden' / 'sites'))
    parser.add_argument('--url', default='http://127.0.0.1:8790')
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--add', nargs='*', default=[], help='pages without an nlp entry yet, to record')
    args = parser.parse_args()
    failures = 0
    checked = 0
    for site in sorted(Path(args.sites).iterdir()):
        config_file = site / 'site.json'
        config = json.loads(config_file.read_text(encoding='utf-8')) if config_file.exists() else {}
        if 'nlp' not in config and site.name not in args.add:
            continue
        texts = texts_of((site / 'index.html').read_text(encoding='utf-8'))
        answered = {'spelling': post(args.url, '/spell', {'texts': texts, 'min_confidence': 0.9}),
                    'dialect': post(args.url, '/dialect', {'texts': texts})}
        checked += 1
        if args.write:
            config['nlp'] = answered
            config_file.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(f'recorded {site.name}')
        elif not same(config['nlp'], answered):
            failures += 1
            print(f'{site.name}: the recorded answers are not the service\'s', file=sys.stderr)
    print(f'{checked} golden page(s) {"recorded" if args.write else "checked"}')
    return 1 if failures or checked == 0 else 0


if __name__ == '__main__':
    sys.exit(main())

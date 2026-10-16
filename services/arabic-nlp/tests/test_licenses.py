"""The data packages are limited to licenses that allow commercial use (docs/design/plans/m7-deep-arabic.md)."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
#: Each of these lets a paid service use the data: MIT and CC BY 4.0 with a notice, GPL v2 as a database the
#: service reads and never distributes or changes.
COMMERCIAL_OK = {'MIT', 'CC-BY-4.0', 'GPL-2.0-only', 'Apache-2.0'}
#: Named so that nobody adds one by accident: Calima MSA s31 is LDC's, and the BERT models are heavy.
NOT_ALLOWED_NAMES = {'morphology-db-msa-s31', 'morphology-db-all', 'all', 'defaults'}


def test_every_locked_package_has_a_license_that_allows_commercial_use() -> None:
    lock = json.loads((ROOT / 'data.lock.json').read_text(encoding='utf-8'))
    assert lock['packages']
    for package in lock['packages']:
        assert package['license'] in COMMERCIAL_OK, package['name']
        assert package['name'] not in NOT_ALLOWED_NAMES
        assert package['url'].startswith('https://github.com/CAMeL-Lab/camel-tools-data/releases/download/')
        assert len(package['zip_sha256']) == 64
        assert all(len(f['sha256']) == 64 for f in package['files'])


def test_the_image_reads_the_lock_and_nothing_else_for_data() -> None:
    dockerfile = (ROOT / 'Dockerfile').read_text(encoding='utf-8')
    assert 'fetch_data.py' in dockerfile and 'data.lock.json' in dockerfile
    assert '--require-hashes' in dockerfile
    assert 'USER 10001' in dockerfile

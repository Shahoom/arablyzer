"""Fetches the data packages data.lock.json names, checks them, and unpacks them where CAMeL Tools
looks (<root>/data/<destination>). Runs at image build, with network; the service never does.

Two checks: the zip's own SHA-256 (made when the lock was written) and the SHA-256 of each file
inside (the maintainers' own catalogue); anything else in a zip is not unpacked.
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
import time
import urllib.request
import zipfile
from pathlib import Path


def download(url: str) -> bytes:
    last: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as response:  # noqa: S310
                return response.read()
        except Exception as error:  # noqa: BLE001
            last = error
            time.sleep(2 * (attempt + 1))
    raise SystemExit(f'could not fetch {url}: {last}')


def main(root: Path, lock: Path) -> None:
    document = json.loads(lock.read_text(encoding='utf-8'))
    packages = document['packages']
    catalogue = download(document['catalogue']['url'])
    if hashlib.sha256(catalogue).hexdigest() != document['catalogue']['sha256']:
        raise SystemExit('the catalogue is not the locked one')
    root.mkdir(parents=True, exist_ok=True)
    (root / 'catalogue.json').write_bytes(catalogue)
    for package in packages:
        blob = download(package['url'])
        digest = hashlib.sha256(blob).hexdigest()
        if digest != package['zip_sha256']:
            raise SystemExit(f"{package['name']}: zip checksum {digest} is not the locked one")
        target = root / 'data' / package['destination']
        with zipfile.ZipFile(io.BytesIO(blob)) as archive:
            names = set(archive.namelist())
            for file in package['files']:
                path = file['path']
                if path not in names or '..' in Path(path).parts or path.startswith('/'):
                    raise SystemExit(f"{package['name']}: {path} is not in the zip, or not a safe path")
                data = archive.read(path)
                if hashlib.sha256(data).hexdigest() != file['sha256']:
                    raise SystemExit(f"{package['name']}: {path} does not match the catalogue's checksum")
                out = target / path
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(data)
        print(f"{package['name']} {package['version']} ({package['license']}) ok", file=sys.stderr)


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(__file__).with_name('data.lock.json'))

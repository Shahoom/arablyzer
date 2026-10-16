"""Settings, from the environment: the caps that keep one request small and the service bounded."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _number(env: dict[str, str], name: str, default: float, low: float, high: float) -> float:
    raw = env.get(name, '').strip()
    if raw == '':
        return default
    try:
        value = float(raw)
    except ValueError as error:
        raise ValueError(f'{name} must be a number') from error
    if not low <= value <= high:
        raise ValueError(f'{name} must be between {low} and {high}')
    return value


@dataclass(frozen=True)
class Settings:
    #: Where the baked data lives: the root that holds `data/` (CAMELTOOLS_DATA's layout).
    data_root: Path
    #: The lowest confidence `/spell` reports when a request names none: precision first.
    min_confidence: float
    #: The lowest a request may ask for; below it the service answers with this.
    floor_confidence: float
    max_body_bytes: int
    max_texts: int
    max_text_chars: int
    max_total_chars: int
    max_findings: int
    max_tokens: int
    #: Seconds a request may work; past it the answer is what is done, marked `truncated`.
    deadline_s: float
    #: Requests worked on at once, and how many more may wait; past both the answer is 503 `busy`.
    workers: int
    queue: int
    #: Words kept in the cache between requests.
    cache_words: int

    @staticmethod
    def from_env(env: dict[str, str] | None = None) -> 'Settings':
        env = dict(os.environ) if env is None else env
        return Settings(
            data_root=Path(env.get('NLP_DATA_ROOT', '/opt/arabic-nlp/camel')),
            min_confidence=_number(env, 'NLP_MIN_CONFIDENCE', 0.9, 0.5, 1.0),
            floor_confidence=_number(env, 'NLP_FLOOR_CONFIDENCE', 0.5, 0.0, 1.0),
            max_body_bytes=int(_number(env, 'NLP_MAX_BODY_BYTES', 262_144, 1_024, 4_194_304)),
            max_texts=int(_number(env, 'NLP_MAX_TEXTS', 400, 1, 5_000)),
            max_text_chars=int(_number(env, 'NLP_MAX_TEXT_CHARS', 5_000, 100, 50_000)),
            max_total_chars=int(_number(env, 'NLP_MAX_TOTAL_CHARS', 60_000, 1_000, 500_000)),
            max_findings=int(_number(env, 'NLP_MAX_FINDINGS', 100, 1, 1_000)),
            max_tokens=int(_number(env, 'NLP_MAX_TOKENS', 2_000, 10, 20_000)),
            deadline_s=_number(env, 'NLP_DEADLINE_S', 8.0, 0.5, 60.0),
            workers=int(_number(env, 'NLP_WORKERS', 2, 1, 8)),
            queue=int(_number(env, 'NLP_QUEUE', 4, 0, 64)),
            cache_words=int(_number(env, 'NLP_CACHE_WORDS', 50_000, 100, 1_000_000)),
        )

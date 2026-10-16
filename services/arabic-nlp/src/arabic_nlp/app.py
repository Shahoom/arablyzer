"""The HTTP face: `/health`, `/analyze`, `/spell` and `/dialect`, each one batch in, one answer out.

No text is logged or kept (only the words cached for speed, which hold no context), nothing is
fetched, and every request is bounded: by size, by a deadline, and by how many run at once.
"""

from __future__ import annotations

import json
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import anyio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import __version__
from .analyze import analyze_texts
from .config import Settings
from .dialect import CamelDialectModel, DialectModel, classify
from .lexicon import CamelLexicon, Lexicon
from .spell import check_texts


@dataclass
class Engines:
    lexicon: Lexicon
    dialect: DialectModel


class Refusal(Exception):
    def __init__(self, status: int, code: str) -> None:
        self.status = status
        self.code = code


def load_engines(settings: Settings) -> Engines:
    return Engines(CamelLexicon(settings.data_root, settings.cache_words), CamelDialectModel(settings.data_root))


def create_app(settings: Settings | None = None, engines: Engines | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    state: dict[str, Any] = {'engines': engines, 'inflight': 0}
    limiter = anyio.CapacityLimiter(settings.workers)

    @asynccontextmanager
    async def lifespan(_: FastAPI):  # noqa: ANN202
        if state['engines'] is None:
            state['engines'] = await anyio.to_thread.run_sync(load_engines, settings)
        yield

    app = FastAPI(title='Arablyzer Arabic NLP', version=__version__, lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)

    app.state.work = state

    @app.exception_handler(Refusal)
    async def refused(_: Request, error: Refusal) -> JSONResponse:
        return JSONResponse({'error': error.code}, status_code=error.status)

    async def read(request: Request) -> dict[str, Any]:
        declared = request.headers.get('content-length')
        if declared is not None and declared.isdigit() and int(declared) > settings.max_body_bytes:
            raise Refusal(413, 'too-large')
        size = 0
        chunks: list[bytes] = []
        async for chunk in request.stream():
            size += len(chunk)
            if size > settings.max_body_bytes:
                raise Refusal(413, 'too-large')
            chunks.append(chunk)
        try:
            body = json.loads(b''.join(chunks))
        except ValueError as error:
            raise Refusal(422, 'bad-request') from error
        texts = body.get('texts') if isinstance(body, dict) else None
        if not isinstance(texts, list) or not texts or not all(isinstance(t, str) for t in texts):
            raise Refusal(422, 'bad-request')
        if len(texts) > settings.max_texts:
            raise Refusal(413, 'too-many-texts')
        if any(len(t) > settings.max_text_chars for t in texts):
            raise Refusal(413, 'text-too-long')
        if sum(len(t) for t in texts) > settings.max_total_chars:
            raise Refusal(413, 'too-large')
        return body

    async def run(work, *args: Any, **kwargs: Any):  # noqa: ANN001, ANN202
        """One request's work, in a thread, behind the gate: busy when the line is full, 504 past its time."""
        if state['inflight'] >= settings.workers + settings.queue:
            raise Refusal(503, 'busy')
        state['inflight'] += 1
        try:
            with anyio.fail_after(settings.deadline_s + 3):
                return await anyio.to_thread.run_sync(
                    lambda: work(*args, **kwargs), limiter=limiter, abandon_on_cancel=True
                )
        except TimeoutError as error:
            raise Refusal(504, 'timeout') from error
        finally:
            state['inflight'] -= 1

    @app.get('/health')
    async def health() -> JSONResponse:
        ready = state['engines'] is not None
        return JSONResponse({'status': 'ok' if ready else 'loading', 'version': __version__},
                            status_code=200 if ready else 503)

    @app.post('/spell')
    async def spell(request: Request) -> dict[str, Any]:
        body = await read(request)
        asked = body.get('min_confidence')
        if asked is not None and (isinstance(asked, bool) or not isinstance(asked, (int, float))):
            raise Refusal(422, 'bad-request')
        minimum = settings.min_confidence if asked is None else max(float(asked), settings.floor_confidence)
        engines_: Engines = state['engines']
        report = await run(
            check_texts, body['texts'], engines_.lexicon,
            min_confidence=minimum, max_findings=settings.max_findings,
            deadline=time.monotonic() + settings.deadline_s,
        )
        return {
            'min_confidence': minimum,
            'words': report.words,
            'judged': report.judged,
            'truncated': report.truncated,
            'findings': [
                {
                    'text': f.text_index, 'start': f.start, 'end': f.end, 'word': f.word,
                    'suggestion': f.suggestion, 'family': f.family, 'confidence': f.confidence,
                    'before': f.before, 'after': f.after, 'alternatives': list(f.alternatives),
                }
                for f in report.findings
            ],
        }

    @app.post('/dialect')
    async def dialect(request: Request) -> dict[str, Any]:
        body = await read(request)
        engines_: Engines = state['engines']
        result = await run(classify, body['texts'], engines_.dialect, time.monotonic() + settings.deadline_s)
        return {
            'model': 'camel-dialectid-model6',
            'label': result.label,
            'probabilities': result.probabilities,
            'votes': result.votes,
            'chunks': result.chunks,
            'words': result.words,
            'truncated': result.truncated,
        }

    @app.post('/analyze')
    async def analyze(request: Request) -> dict[str, Any]:
        body = await read(request)
        engines_: Engines = state['engines']
        found, truncated = await run(
            analyze_texts, body['texts'], engines_.lexicon,
            max_tokens=settings.max_tokens, deadline=time.monotonic() + settings.deadline_s,
        )
        return {
            'truncated': truncated,
            'tokens': [
                {
                    'text': a.text_index, 'start': a.start, 'end': a.end, 'word': a.word,
                    'known': a.known, 'gulf': a.gulf, 'spelling': a.spelling,
                    'lemma': a.lemma, 'root': a.root, 'pos': a.pos,
                }
                for a in found
            ],
        }

    return app

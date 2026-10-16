import json

import pytest
from fastapi.testclient import TestClient

from arabic_nlp.app import Engines, create_app
from arabic_nlp.config import Settings
from conftest import FakeLexicon


class FakeDialect:
    def scores(self, chunks: list[str]) -> list[dict[str, float]]:
        return [{'MSA': 0.1, 'DOH': 0.7, 'CAI': 0.1, 'BEI': 0.05, 'RAB': 0.03, 'TUN': 0.02} for _ in chunks]


@pytest.fixture
def client(fake) -> TestClient:  # noqa: ANN001
    settings = Settings.from_env({'NLP_MAX_TEXTS': '5', 'NLP_MAX_TEXT_CHARS': '200', 'NLP_MAX_TOTAL_CHARS': '1000'})
    with TestClient(create_app(settings, Engines(fake, FakeDialect()))) as client:
        yield client


def test_health(client: TestClient) -> None:
    response = client.get('/health')
    assert response.status_code == 200 and response.json()['status'] == 'ok'


def test_spell_answers_a_batch(client: TestClient) -> None:
    response = client.post('/spell', json={'texts': ['تتميز الاسعار بالمنافسة', 'نص سليم']})
    body = response.json()
    assert response.status_code == 200
    assert body['min_confidence'] == 0.9 and body['truncated'] is False
    assert [(f['text'], f['word'], f['suggestion'], f['family']) for f in body['findings']] == [(0, 'الاسعار', 'الأسعار', 'hamza')]


def test_spell_honours_a_request_for_more_findings_but_not_below_the_floor(client: TestClient) -> None:
    body = client.post('/spell', json={'texts': ['يجب ان تكون'], 'min_confidence': 0.1}).json()
    assert body['min_confidence'] == 0.5
    assert body['findings'] and body['findings'][0]['confidence'] < 0.9


def test_dialect_aggregates_the_sentences(client: TestClient) -> None:
    text = 'هذا نص طويل بما يكفي ليكون جملة كاملة من عشر كلمات أو أكثر قليلا'
    body = client.post('/dialect', json={'texts': [text, text]}).json()
    assert body['label'] == 'gulf' and body['chunks'] == 2
    assert body['probabilities']['gulf'] == pytest.approx(0.7)


def test_analyze_gives_tokens(client: TestClient) -> None:
    body = client.post('/analyze', json={'texts': ['المدرسة الاسعار']}).json()
    assert [t['word'] for t in body['tokens']] == ['المدرسة', 'الاسعار']
    assert body['tokens'][0]['known'] is True and body['tokens'][0]['spelling'] == 'المدرسة'


@pytest.mark.parametrize(
    ('payload', 'status', 'code'),
    [
        ({}, 422, 'bad-request'),
        ({'texts': []}, 422, 'bad-request'),
        ({'texts': 'نص'}, 422, 'bad-request'),
        ({'texts': [1]}, 422, 'bad-request'),
        ({'texts': ['ن'] * 6}, 413, 'too-many-texts'),
        ({'texts': ['ن' * 201]}, 413, 'text-too-long'),
        ({'texts': ['ن' * 200] * 5 + ['x']}, 413, 'too-many-texts'),
        ({'texts': ['ن' * 200] * 5, 'min_confidence': 'high'}, 422, 'bad-request'),
    ],
)
def test_refuses_what_is_over_the_caps(client: TestClient, payload: dict, status: int, code: str) -> None:
    path = '/spell'
    response = client.post(path, json=payload)
    assert (response.status_code, response.json()['error']) == (status, code)


def test_refuses_a_body_that_is_not_json_or_is_too_big(client: TestClient) -> None:
    assert client.post('/spell', content=b'not json').status_code == 422
    big = json.dumps({'texts': ['ن'], 'pad': 'x' * 300_000})
    assert client.post('/spell', content=big).status_code == 413


def test_says_busy_when_the_line_is_full(fake) -> None:  # noqa: ANN001
    settings = Settings.from_env({'NLP_WORKERS': '1', 'NLP_QUEUE': '0'})
    app = create_app(settings, Engines(fake, FakeDialect()))
    with TestClient(app) as client:
        # one request is in flight when another arrives
        app.state.work['inflight'] = 1
        response = client.post('/spell', json={'texts': ['نص']})
        assert (response.status_code, response.json()['error']) == (503, 'busy')


def test_has_no_docs_routes(client: TestClient) -> None:
    for path in ('/docs', '/redoc', '/openapi.json'):
        assert client.get(path).status_code == 404


def test_the_service_does_not_log_the_texts(client: TestClient, capsys: pytest.CaptureFixture[str]) -> None:
    client.post('/spell', json={'texts': ['سر خاص جدا الاسعار']})
    captured = capsys.readouterr()
    assert 'سر خاص' not in captured.out + captured.err

# syntax=docker/dockerfile:1
# Arablyzer's Arabic NLP service (docs/design/plans/m7-deep-arabic.md). Three stages and a test target:
# `data` fetches and checks the data packages, `deps` installs the hash-pinned requirements, `runtime`
# is what runs (non-root, nothing writable, no network needed), `test` is runtime plus pytest.
ARG PYTHON=python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1

FROM ${PYTHON} AS data
WORKDIR /build
COPY data.lock.json fetch_data.py ./
RUN python fetch_data.py /opt/arabic-nlp/camel

FROM ${PYTHON} AS deps
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
WORKDIR /build
COPY requirements.txt requirements-camel.txt ./
RUN pip install --require-hashes -r requirements.txt \
 && pip install --no-deps --require-hashes -r requirements-camel.txt

FROM ${PYTHON} AS runtime
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin nlp
COPY --from=deps /opt/venv /opt/venv
COPY --from=data /opt/arabic-nlp/camel /opt/arabic-nlp/camel
COPY data.lock.json /opt/arabic-nlp/data.lock.json
COPY src /opt/arabic-nlp/src
RUN python -m compileall -q /opt/arabic-nlp/src
# One thread of BLAS and OpenMP each: the service runs one request at a time per worker thread, and
# the compose limit is one CPU.
ENV PATH=/opt/venv/bin:$PATH PYTHONPATH=/opt/arabic-nlp/src PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
    NLP_DATA_ROOT=/opt/arabic-nlp/camel HOME=/tmp
USER 10001
EXPOSE 8790
CMD ["python", "-m", "arabic_nlp"]

FROM runtime AS test
USER root
COPY requirements-dev.txt /tmp/requirements-dev.txt
RUN pip install --no-cache-dir --require-hashes -r /tmp/requirements-dev.txt
COPY pyproject.toml Dockerfile /opt/arabic-nlp/
COPY tests /opt/arabic-nlp/tests
COPY tools /opt/arabic-nlp/tools
WORKDIR /opt/arabic-nlp
USER 10001
CMD ["python", "-m", "pytest", "-q"]

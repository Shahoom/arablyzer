# The scanner image (Phase 1 design §6, decision 9): Node 24, the three browsers Playwright pins with
# the system libraries they need, and a fixed set of fonts, so what the browsers draw, and so the
# golden reports, do not depend on the machine. Built in CI, not published.
#
#   docker build --platform linux/amd64 -t arablyzer .
#   docker run --rm --network none -e ARABLYZER_NETWORK_ISOLATED=1 --entrypoint pnpm arablyzer test:golden
#
# --network none leaves the container its loopback alone, which is what isolation means for WebKit
# (plan §13); scanning the web needs the egress network of Phase 2 instead.
FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

ENV PNPM_HOME=/opt/pnpm \
    PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright \
    CI=true
ENV PATH=$PNPM_HOME:$PATH

# Fonts for Arabic and Latin text (the Noto families and DejaVu), fontconfig to list them.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-dejavu-core fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

RUN useradd --create-home --uid 10001 arablyzer
WORKDIR /arablyzer
COPY --chown=arablyzer:arablyzer . .
RUN pnpm install --frozen-lockfile
# The browsers of the Playwright the workspace pins, with the libraries (and fonts) they need.
RUN pnpm --filter @arablyzer/browser exec playwright-core install --with-deps chromium firefox webkit \
 && rm -rf /var/lib/apt/lists/* \
 && chmod -R a+rX /opt/ms-playwright
RUN pnpm --filter @arablyzer/cli build \
 && chown -R arablyzer:arablyzer /arablyzer/packages/cli/dist
# The fonts as the browsers find them: a change here changes the golden reports.
RUN fc-list --format '%{family[0]}|%{style[0]}|%{file}\n' | sort > /arablyzer/fonts.txt

USER arablyzer
ENV ARABLYZER_IMAGE=1
ENTRYPOINT ["node", "/arablyzer/packages/cli/dist/arablyzer.mjs"]
CMD ["--help"]

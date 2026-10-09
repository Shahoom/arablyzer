# Arablyzer's images, a stage for each (M2.1 plan §5b). The last stage, the one a plain build
# makes, is the scanner image of Phase 1 (design §6, decision 9) that CI runs the golden reports
# in: Node 24, the three browsers Playwright pins with the system libraries they need, and the
# fonts they draw with, listed in /arablyzer/fonts.txt, so what the browsers draw, and so the
# golden reports, do not depend on the machine. The reports hold for linux/amd64.
#
#   docker build --platform linux/amd64 -t arablyzer .
#   docker run --rm --platform linux/amd64 --network none -e ARABLYZER_NETWORK_ISOLATED=1 --entrypoint pnpm arablyzer test:golden
#
# --network none leaves the container its loopback alone, which is what isolation means for WebKit
# (plan §13). The stack's stages (api, worker, scanner, web) are built by infra/compose.yaml.
FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS base

ENV CI=true

RUN useradd --create-home --uid 10001 arablyzer
WORKDIR /arablyzer

# The pnpm package.json names, for every user: pnpm would otherwise fetch that version when a
# script runs, and the golden reports run with no network (CI run 36419120972).
COPY package.json ./
RUN npm install --global "$(node -p "require('./package.json').packageManager.split('+')[0]")"

# The code and its dependencies.
FROM base AS workspace
# The user the tests run as owns the code: Vite writes its bundled config next to vitest.config.ts
# (CI run 36427884836).
COPY --chown=arablyzer:arablyzer . .
RUN pnpm install --frozen-lockfile

# The API: TypeScript run as it is, through tsx, as every package exports its sources.
FROM workspace AS api
USER arablyzer
EXPOSE 8787
CMD ["node", "--import", "tsx", "apps/api/src/server.ts"]

# The worker: the queue and the stores, and no browser.
FROM workspace AS worker
USER arablyzer
CMD ["node", "--import", "tsx", "apps/worker/src/main.ts"]

# The browsers, with the libraries and the fonts they need. Made from the Playwright version the
# workspace pins and nothing else, so a change to the code does not download them again.
FROM base AS browser-base
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
# Fonts for Arabic and Latin text (the Noto families and DejaVu), fontconfig to list them.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-dejavu-core fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*
# The browsers of the Playwright packages/browser pins, with the libraries (and fonts) they need.
COPY packages/browser/package.json /tmp/browser-package.json
RUN npm exec --yes \
      --package="playwright-core@$(node -p "require('/tmp/browser-package.json').dependencies['playwright-core']")" \
      -- playwright-core install --with-deps chromium firefox webkit \
 && rm -rf /var/lib/apt/lists/* /root/.npm /tmp/browser-package.json \
 && chmod -R a+rX /opt/ms-playwright
# The fonts as the browsers find them; the golden run compares them with fixtures/golden/fonts.txt.
RUN fc-list --format '%{family[0]}|%{style[0]}|%{file}\n' | sort > /arablyzer/fonts.txt

FROM browser-base AS browsers
COPY --from=workspace --chown=arablyzer:arablyzer /arablyzer /arablyzer

# The site, built for the origin it will be served from, with its pages' Open Graph images, which
# Chromium draws (M2.4c): the browsers' image, whose fonts and versions are fixed.
FROM browsers AS site
ARG ARABLYZER_SITE=https://arablyzer.example
ARG PUBLIC_TURNSTILE_SITE_KEY=
ARG PUBLIC_AUTH_GOOGLE_CLIENT_ID=
RUN ARABLYZER_SITE="$ARABLYZER_SITE" PUBLIC_TURNSTILE_SITE_KEY="$PUBLIC_TURNSTILE_SITE_KEY" \
    PUBLIC_AUTH_GOOGLE_CLIENT_ID="$PUBLIC_AUTH_GOOGLE_CLIENT_ID" \
    pnpm --filter @arablyzer/web build

# The site's server: the pages, /api to the API, and the headers (infra/Caddyfile). It listens
# above port 1024 as nobody, so the capability its binary carries, to bind lower ones, goes: a
# container without capabilities cannot run a binary that asks for one.
FROM caddy:2.11-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b AS web
RUN setcap -r /usr/bin/caddy
COPY --from=site /arablyzer/apps/web/dist /srv
COPY infra/Caddyfile /etc/caddy/Caddyfile
USER nobody

# The scanner: the engine and its browsers. Where its only way out is the egress proxy, Compose
# says so (ARABLYZER_NETWORK_ISOLATED), and WebKit may run; the image claims nothing of the kind.
FROM browsers AS scanner
USER arablyzer
EXPOSE 8788
CMD ["node", "--import", "tsx", "apps/scanner/src/main.ts"]

# The golden reports' image, last so a plain build makes it (CI).
FROM browsers AS golden
RUN pnpm --filter @arablyzer/cli build
USER arablyzer
ENV ARABLYZER_IMAGE=1
ENTRYPOINT ["node", "/arablyzer/packages/cli/dist/arablyzer.mjs"]
CMD ["--help"]

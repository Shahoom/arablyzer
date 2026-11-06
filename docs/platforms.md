# The Salla and Zid merchant apps (M9, issue #41)

Both apps are built, tested and **off**. Nothing of either is reachable until its flag is `on`
(`ARABLYZER_SALLA`, `ARABLYZER_ZID`). They only go live after both stores approve them, and the
owner creates every account and registers every app by hand: this repository holds no account,
no key and no terms accepted.

## What a merchant gets

1. Installs the app from the store's app market.
2. Arablyzer receives the install, the store's name and storefront address, and the tokens.
3. The storefront is audited by the same scanner, behind the same egress proxy and the same
   rate rules as a public scan (below).
4. The store's dashboard opens the app: a page in Arabic (English when the dashboard asks) with
   the latest audit's score, the findings by severity, the score by area, and a link to the
   full report on arablyzer.com.
5. Uninstalling deletes the tokens, the audits' scans and their reports, and the store's row.

A merchant has no Arablyzer account: the platform vouches for them (Salla's session token, Zid's
lookup token). Google sign-in, plans and quotas are not involved.

## The routes

Under `/api/platforms/<salla|zid>/`. A platform that is off has none of them (404).

| Route | What it is |
| --- | --- |
| `GET install` | Starts the authorization code flow (Salla's Custom Mode; Zid's activation). Sets a signed cookie, stores a one-time `state`, redirects to the platform. Salla's published apps install from the app store with Easy Mode instead (the `app.store.authorize` webhook). |
| `GET callback` | Checks the `state` three ways (the signed, path-bound cookie, its expiry, a one-time value in the store), then exchanges the code once, learns the store, stores the sealed tokens, asks for the audit. |
| `POST webhook` | Verifies the sender before reading the body (below), then applies the event. A store failure answers 503 so the platform delivers it again. |
| `GET panel` | The page the dashboard embeds (Salla: `?token=` checked with Salla's introspection API; Zid: `?token=` is the lookup token Zid was given). |

Events handled. Salla: `app.store.authorize` (tokens), `app.installed`, `app.updated` and
`app.settings.updated` (store updates: the address is read again and a new audit is asked for),
`app.uninstalled`. Zid: `app.market.application.authorized`, `.install` (the store's address),
`.uninstall`. Every other event is answered 200 and ignored.

## Security

- **Webhooks.** Salla: HMAC-SHA-256 of the raw body under the webhook secret, in `X-Salla-Signature`,
  compared in constant time; the owner may choose Salla's `token` strategy (`Authorization`) with
  `ARABLYZER_SALLA_WEBHOOK_STRATEGY`, and the strategy is the server's choice, never the
  request's. Zid documents no signature, only headers the owner adds, so the check is a secret
  in `X-Arablyzer-Webhook-Token`, constant time, plus the app id in the payload.
- **Tokens** are sealed with AES-256-GCM under a key derived (HKDF-SHA-256) from
  `ARABLYZER_PLATFORM_SECRET`, bound to the store (platform and key) as associated data: a
  sealed value copied to another row does not open. They never reach a log, a page or a URL.
  An older token set, replayed in a signed webhook, does not overwrite a newer one.
- **State.** OAuth `state` is random, bound to the browser by a signed `HttpOnly`, `Lax`,
  path-scoped cookie, expires in ten minutes, and works once. Zid has no PKCE and gets none.
- **Calls to the platforms** go through the API's egress rules (`safeFetch`, the server policy)
  with a timeout and a size cap; the API's worker role cannot read the new tables.
- **The panel** sends `Cache-Control: no-store`, `noindex` and no referrer; its policy is
  `default-src 'none'`, the one stylesheet and (Salla) the one inline script by hash, the
  Embedded SDK by exact URL and `integrity`, and `frame-ancestors` naming the dashboard. No
  `style=""`, font weights 400 and 600, no letter-spacing, numbers and addresses in
  `<bdi dir="ltr">`.
- **Rates.** One visitor: 60 requests a minute across install, callback and panel.

## How the audit follows the public scan's rules

A webhook does not scan; it asks. The API's scheduler (one tick a minute, `platforms/audit.ts`)
claims the stores whose audit is due, with a lease so a second process repeats nothing, and then
does what the monitoring scheduler does for a saved site: one audit of a store at a time (an
in-flight place), the address checked by the egress policy and resolved with every answer
vetted (a private, loopback, link-local or own address becomes a failed scan, as for a visitor),
the host's bucket (`ARABLYZER_LIMIT_HOST_*`), and only into the lower half of the queue, so a
visitor is never behind a store. What cannot start now is put off a few minutes. A store is
audited at most once a day, however many updates arrive. The worker scans through the egress
proxy as for every scan, and retention deletes the scan as for every unlinked scan; the panel
then asks for a new audit.

Tokens are refreshed by the same scheduler: Salla's three days before the access token (14 days)
ends, with the single-use refresh token (a second use would revoke everything); Zid's every 300
days, on a calendar, since its refresh token dies two years before its access token. A refusal
by the platform drops the tokens and the panel asks the merchant to activate the app again.

## Documents followed (official public developer docs only)

Salla
- Authorization: https://docs.salla.dev/authorization.md
- Webhooks (signature and token strategies): https://docs.salla.dev/webhooks.md
- App events: https://docs.salla.dev/partner-apis/app-events.md
- Store information: https://docs.salla.dev/merchants/store-info.md
- Embedded SDK: https://docs.salla.dev/embedded-sdk/create-app.md,
  https://docs.salla.dev/embedded-sdk/authentication.md,
  https://docs.salla.dev/embedded-sdk/endpoint-tokent-introspect.md,
  https://docs.salla.dev/embedded-sdk/installation.md,
  https://docs.salla.dev/embedded-sdk/page-modules-redirects.md,
  https://docs.salla.dev/embedded-sdk/design-guidelines.md
- Publishing: https://docs.salla.dev/playbook/launch-grow/publish-app.md

Zid
- Authorization: https://docs.zid.sa/authorization.md
- Public apps OAuth requirements: https://docs.zid.sa/oauth-requirements.md
- Embedded apps: https://docs.zid.sa/embedded-apps-2168216m0.md
- Subscription and app events: https://docs.zid.sa/subscription-and-app-events-2490915m0.md
- Webhooks: https://docs.zid.sa/webhooks.md
- Store manager profile: https://docs.zid.sa/get-manager-profile.md
- Creating and submitting an app: https://docs.zid.sa/create-first-app.md,
  https://docs.zid.sa/submit-app-for-review.md

## Assumptions (where the docs are unclear)

1. **Salla's webhook signature** is the HMAC over the raw bytes of the body (the PHP example does
   so; the Node example hashes `JSON.stringify(req.body)`, which can differ in whitespace).
2. **Salla's `token` strategy**: the secret arrives in `Authorization`, with or without `Bearer`.
3. **Salla's merchant id** is the same number in the webhook's `merchant`, the introspection's
   `merchant_id` and the store information's `id`.
4. **Salla's token endpoint** takes a form body (`grant_type`, `code`, `client_id`,
   `client_secret`, `redirect_uri`; for a refresh, `refresh_token`), and its answer's `expires`
   is a count of seconds there and a unix time in the webhook: a number above 10^9 is read as a
   time. The store information needs `settings.read`.
5. **Salla's dashboard host** is `https://s.salla.sa` (the embedded address in the docs), and is
   the only `frame-ancestors`. The SDK's UMD global is `SallaEmbeddedSDK.embedded`; `onThemeChange`
   is called only if it exists. The SDK is pinned to 0.2.7 with its SRI hash; update both
   together.
6. **Zid's webhook** has no documented signature or header name: the owner adds the header.
   Zid's stated CSP for embedded pages is permissive; ours is stricter (hashes only) and carries
   its `frame-ancestors` list.
7. **Zid's authorize request** carries `scope=embedded_apps_tokens_write` (Embedded Apps, step 1);
   the other scopes are chosen in the Partner Dashboard. The app needs `account.read` for the
   store profile (the only way the callback learns which store it is).
8. **Zid's storefront address** arrives only in the install and authorized events (`store_url`);
   with those events not subscribed, no audit is ever asked for.
9. **Zid store updates**: the docs list no store-update event. A reactivation (new token pair)
   arrives as a new callback and overwrites the tokens; the install event again asks for an audit.
10. A replayed signed uninstall cannot be told from a real one (neither platform sends an event
    id or a usable timestamp). The effect is a store asked to activate the app again.

## Not verified (needs a real store)

Nothing has run against Salla or Zid: the tests answer for them with the documented shapes. First
checks once an account exists: the dashboards' frame hosts, that Salla's SDK handshake clears the
loading overlay, Zid's exact header handling for webhooks, and the shape of Zid's token and
profile answers.

## The owner's checklist

**Do now, in this order** (the apps are off until step 6)

1. *Salla Partners account* (https://salla.partners; a merchant account is not the same as a
   Partner account). Choose the partner type that fits (developer or service provider), verify it.
2. *Zid Partner account* (https://partner.zid.sa): Partnership > Onboarding (three steps), contact
   people, **bank account** (required even for a free app, with the tax document matching the VAT
   answer), and sign the partnership agreement (an unsigned agreement blocks submission).
3. Create a **demo store** in each (Salla: from the Partners Portal; Zid: a development store).
4. Create the app in each. Salla: My Apps > Create; choose the OAuth mode **Easy Mode** (the only
   mode allowed for published apps); scopes `settings.read`, `offline_access`. Zid: Apps > Create
   application > **Public app**; Arabic name 3 to 24 characters containing Arabic, English name
   without Arabic; scopes: embedded apps, `account.read`; fill "Why does your app need these
   scopes?" in 50 to 200 characters (the audit reads the store's public pages and its name; it
   changes nothing).
5. Enter the addresses (`<site>` is `https://arablyzer.com`):

   | | Salla (Partners Portal) | Zid (Partner Dashboard) |
   | --- | --- | --- |
   | Webhook URL | `<site>/api/platforms/salla/webhook` | `<site>/api/platforms/zid/webhook` |
   | Webhook security | Signature (the default) | add the header `X-Arablyzer-Webhook-Token` with the value of `ARABLYZER_ZID_WEBHOOK_SECRET` |
   | Events to subscribe | `app.store.authorize`, `app.installed`, `app.updated`, `app.settings.updated`, `app.uninstalled` | `app.market.application.authorized`, `.install`, `.uninstall` |
   | Callback / redirection URL | `<site>/api/platforms/salla/callback` (Custom Mode, for testing) | `<site>/api/platforms/zid/callback` (Redirection URL and Callback URL, exactly: scheme, host, path, no trailing slash) |
   | Embedded page / Application URL | Embedded Pages: a route slug, URL `<site>/api/platforms/salla/panel`, primary; plus the 1420 x 520 px Embedded App Banner | Application URL `<site>/api/platforms/zid/panel`; enable *Embedded experience* |

6. Put the values in the server's environment (never in the repository):
   `ARABLYZER_PLATFORM_SECRET` (`openssl rand -hex 32`), then per app the group in
   `infra/.env.example` (client id and secret, app id, webhook secret), and set the flag to `on`.
   The API refuses to start with a group half set and names the missing variable. Redeploy.
7. Install the app on the demo store, check: the install, the audit appears in the panel within
   minutes, the panel opens inside the dashboard in Arabic and in English, dark mode, and the
   uninstall (the store's row and reports are gone).

**Review and submission**

- *Salla*: submit from the Partners Portal after the pre-flight in the Publishing playbook: icon
  and screenshots matching the build, description (outcome first), privacy and data-handling
  documentation (what we read, that tokens are encrypted and deleted on uninstall, which third
  party gets data: none), and a full pass of install, onboarding, use, errors and uninstall.
  Expect at least one revision round.
- *Zid*: Publish tab > submit. Reviewers check the activation flow against the OAuth
  requirements: Activate starts OAuth at once (no signup first), denial leaves nothing half
  made, reactivation overwrites tokens, uninstall removes access, the embedded panel opens
  without a second login. Give the review team the demo store and a short video.
- Plans and pricing in each store are the owner's decision (the repository holds none).
- Arabic copy: `packages/i18n/src/platforms.ts` is unreviewed (`reviewed: false`) and the CI check
  "Arabic copy reviewed by the owner" waits for the owner's reading.

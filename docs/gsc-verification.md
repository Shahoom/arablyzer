# Google OAuth verification for Search Console — the owner's checklist

> **ملخص للمالك:** قبل أن يقدر أي زائر على ربط Search Console يجب أن توافق Google على التطبيق، لأن النطاق `webmasters.readonly` «حسّاس». هذا الملف هو القائمة الكاملة: ما تضعه في شاشة الموافقة، ونص تبرير النطاق (جاهز للنسخ)، وسيناريو الفيديو بالترتيب، وما يلزم في المنتج. صفحات `/privacy` و`/terms` و`/security` مبنية. **ما بقي عليك:** نطاق `arablyzer.com` يعمل بـ HTTPS ومثبَّت الملكية في Search Console، ومشروع Google Cloud، وبريد الدعم، والفيديو، والإرسال، ثم الرد على أسئلة المراجعين. الوقت الذي تستغرقه Google غير مضمون (أسابيع عادةً).

Arablyzer asks Google for one sensitive scope. Until Google verifies the app, the consent screen warns visitors ("Google hasn't verified this app") and the number of users is capped at 100 test users. This file is everything the submission needs. Do it when `arablyzer.com` is live.

## 0. What the product does with the scope (the facts the review checks)

| Fact | Where it is true |
|---|---|
| One scope: `https://www.googleapis.com/auth/webmasters.readonly` | `apps/api/src/gsc/oauth.ts` (`GSC_SCOPE`) |
| Online token, no refresh token (`access_type=online`), PKCE (S256), `state`, the account chooser every time | `authorizationUrl` |
| Token in a header only; revoked in a `finally` as soon as the reading ends, even when it fails | `apps/api/src/gsc/routes.ts`, `google.ts` |
| Nothing is stored: the result waits 5 minutes in a temporary store and is read once; the typed site and the PKCE verifier wait 10 minutes | `RESULT_TTL_SECONDS`, `FLOW_TTL_SECONDS` |
| Calls made: `sites.list`, `searchAnalytics.query` (totals, queries, pages, countries), `urlInspection.index.inspect` | `google.ts`, `routes.ts`, `keywords.ts` |
| Two places use it: a finished report's "What Google knows about your site" card, and the tool «كلماتك في جوجل» (`/tools/gsc-keywords`) | `apps/web/src/islands/report/Gsc.tsx`, `search/GscKeywords.tsx` |
| Off without `ARABLYZER_GSC_CLIENT_ID` and `ARABLYZER_GSC_CLIENT_SECRET`: the card is hidden, the tool shows a notice | `registerGscRoutes`, `GET /api/gsc/status` |

## 1. Before you submit

1. **The domain.** `arablyzer.com` serves the site over HTTPS, the home page needs no sign-in and has the privacy policy in its footer (done: «الخصوصية»), and `ARABLYZER_SITE=https://arablyzer.com`.
2. **Verify the domain in Search Console** with the same Google account that owns the Cloud project (Search Console, Add property, Domain, the DNS TXT record). Google checks that the authorized domain is verified by a project owner or editor.
3. **A Google Cloud project for Search Console only**, apart from the sign-in client (`ARABLYZER_AUTH_GOOGLE_CLIENT_*`, scopes `openid email profile`, which are not sensitive). One project holds one consent screen: keeping the two apart keeps this verification about one scope.
4. **The OAuth client**: type "Web application"; Authorized redirect URI `https://arablyzer.com/api/gsc/callback` (add `http://127.0.0.1:8080/api/gsc/callback` while testing); no JavaScript origin is needed (the flow is server-side). Put its id and secret in `ARABLYZER_GSC_CLIENT_ID` and `ARABLYZER_GSC_CLIENT_SECRET`.
5. **Test it once in "Testing" mode** with your own account as a test user: a report's card, then the tool, then reload (the data must be gone) and check `myaccount.google.com/permissions` (Arablyzer must not be listed: the token was revoked).
6. **Fill the placeholders in the legal pages** (they are `reviewed: false`): confirm `privacy@arablyzer.com` and `security@arablyzer.com` are real mailboxes, state the number of days reports are kept if you set `ARABLYZER_REPORT_RETENTION_DAYS` (the privacy page says "the days the operator sets"), and add the operator's legal name and governing law to the terms if counsel wants them. Have the three pages read by a lawyer.

## 2. The OAuth consent screen (Google Auth platform, Branding)

| Field | Final copy |
|---|---|
| App name | `Arablyzer` (exactly; it must match the home page and the logo) |
| User support email | your address (a Google-account email or a Google Group you manage) |
| App logo | 120 × 120 px PNG, under 1 MB. Made from the site's mark: `pnpm --filter @arablyzer/chrome-extension exec tsx -e "import {markPng} from './scripts/icons.ts'; import {writeFileSync} from 'node:fs'; writeFileSync('oauth-logo-120.png', markPng(120))"` then upload `integrations/chrome-extension/oauth-logo-120.png` (do not commit it) |
| Application home page | `https://arablyzer.com/en/` (the English page; the Arabic one is `https://arablyzer.com/`) |
| Application privacy policy link | `https://arablyzer.com/en/privacy` |
| Application terms of service link | `https://arablyzer.com/en/terms` |
| Authorized domains | `arablyzer.com` |
| Developer contact information | your address |
| User type | External; publishing status "In production" when you submit |

**Short description for the review form** (what the app does):

> Arablyzer is a free, open-source analyzer for Arabic websites. A site owner scans a page and reads findings in Arabic or English. Optionally the owner connects Google Search Console, read-only, to see in the same page the clicks, impressions, click-through rate, position, top queries, pages and countries of their own verified property for the last 28 days, and Google's index status of the scanned page. The data is shown once in the owner's browser and is never stored.

## 3. Scope justification (paste into "Scopes" → justification)

**Scope:** `https://www.googleapis.com/auth/webmasters.readonly`

> Arablyzer shows a site owner what Google knows about their own site next to the findings of our scan. When the owner clicks "Connect Search Console" (on a finished scan report, or on our "Your keywords on Google" tool), we read, with the owner's permission and for their verified property only: the list of their properties (sites.list) to find the one that matches the site; the last 28 days' totals, top queries, pages and countries (searchAnalytics.query), up to 1,000 queries in the keywords tool; and the index status of the scanned page (urlInspection.index.inspect). We show this in the owner's browser: the owner sees which queries find them, which are on page two of Google, and whether Google indexed their page.
>
> We never write to Search Console, so the read-only scope is the narrowest that covers these calls. We do not store the data or any token: we request an online access token (no refresh token), use it once, revoke it at Google immediately afterwards (even when the reading fails), and hold the result for at most five minutes in a temporary store from which it is read once. We do not use the data for advertising or to train models, and we do not transfer it to anyone. Arablyzer's use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. The privacy policy (https://arablyzer.com/en/privacy, section "Google Search Console") says all of this.

## 4. The demo video (YouTube, unlisted; English UI; 1080p; one take)

Google asks for a video that shows the whole OAuth flow end to end, the consent screen with the **client ID visible in the address bar**, and how each scope is used in the product. Set the recording account's Google language to English so the consent screen is in English. Use a test property you own with real data. Show the browser's address bar throughout.

1. **0:00** Open `https://arablyzer.com/en/`. Say the app's name and what it does in one sentence. Scroll to the footer and click "Privacy" (the policy on the same domain); scroll to "Google Search Console"; go back.
2. **0:30** Scan a page of the test property. When the report is ready, scroll to the card "What Google knows about your site". Read its line: read-only, nothing stored. Click **Connect Search Console**.
3. **1:00** On Google's account chooser pick the test account. On the consent screen **pause for 5 seconds on the address bar so the `client_id` is readable**, and on the app name "Arablyzer" and the permission text. Click Allow.
4. **1:30** Back on the report: the card shows the property, the 28 days' totals, top queries, pages, countries and the page's index status. Point to each and say where it comes from (`sites.list`, `searchAnalytics.query`, `urlInspection.index.inspect`).
5. **2:30** Reload the page. The card asks to connect again: the data is gone. Say it is shown once and not stored.
6. **3:00** Open `https://arablyzer.com/en/tools/gsc-keywords`. Type the domain, click Connect, go through the consent screen again (address bar visible), show the results: near opportunities (positions 8 to 20), Arabic against Latin share, spellings, top queries.
7. **4:00** Open `https://myaccount.google.com/permissions`: Arablyzer is not in the list, because the token was revoked right after use.
8. **4:30** End on the privacy policy's "Google Search Console" section and the Limited Use sentence.

## 5. In-product requirements (what the reviewers check) and where each is met

| Requirement | Met by |
|---|---|
| Home page is public, explains the app, and links to the privacy policy | `/` and `/en/`; footer link «الخصوصية» / "Privacy" |
| Privacy policy on the authorized domain, naming the data requested, how it is used, stored, shared and deleted | `/privacy`, `/en/privacy`: sections "Google Search Console" and "Your rights" |
| Limited Use statement | the last paragraph of that section |
| Terms of service | `/terms`, `/en/terms` |
| The app asks for no more than it uses | one scope; `sites.list`, `searchAnalytics.query`, `urlInspection.index.inspect` only |
| The user can see what is requested and revoke | Google's consent screen; the revoke happens in our code at once; `myaccount.google.com/permissions` |
| Branding matches (name, logo, domain) | section 2 |
| A security contact | `/security`, `/.well-known/security.txt` |
| No data kept | section 0; tests in `apps/api/test/gsc.test.ts` (the token never in a URL, a log or a result; revoked; a result read once) |

## 6. Submitting

1. Google Cloud console, **Google Auth platform**: Branding (section 2), Audience (External, In production), Data access (add the scope, paste the justification of section 3, add the video link).
2. Press **Prepare for verification**, then **Submit**. Google first checks the branding, then the sensitive scope; the questions come to the developer contact email, and they are answered in the same thread. Answer with the facts of section 0.
3. Until it is approved, only the 100 test users you list can connect, and others see the "unverified app" warning. Keep `ARABLYZER_GSC_CLIENT_*` set meanwhile if you want to demonstrate the feature.

## 7. The usual reasons for a rejection

- The home page has no link to the privacy policy, or the policy is on another domain.
- The video does not show the `client_id` in the address bar, the consent screen, or the data being used.
- The justification is vague: say which call needs the scope and why a narrower one will not do (there is none narrower that reads Search Analytics).
- The authorized domain is not verified in Search Console by an owner or editor of the project.
- The app name on the consent screen differs from the name on the home page and in the video.

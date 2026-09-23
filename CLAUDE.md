# Arablyzer

Open-source (AGPL-3.0) website analyzer for Arabic and Gulf websites — LAB-001 of
CloudTopia Labs. A Shipwork-style toolbox of ~110 free single-purpose checks plus
a deep Arabic layer: cross-engine Arabic rendering, Arabic fonts, RTL, Arabic
forms, Arabic-aware SEO, Gulf e-commerce, WhatsApp. The hosted site is free by
default; paid plans exist only for heavy use.

**Source of truth: `docs/BUILD-PLAN.md`** (written in Arabic; technical terms in
English). Read the sections relevant to a task before starting it.

## Non-negotiables

- **The engine is deterministic code.** Fetch, parse, render with Playwright,
  measure the DOM, axe-core, Lighthouse, DNS/TLS checks, bounded crawling. The
  same page gives the same result every time. AI is optional (tailored fix
  explanations on demand, language signals, annual-report classification) and
  never creates findings or changes a score.
- **Security (plan §13).** All scan traffic goes through the egress proxy.
  The proxy denies private/loopback/link-local/CGNAT/metadata ranges, Docker and
  WireGuard networks, and **the host server's own public IP**. Scanner
  containers live on an isolated network. Never submit forms; never bypass
  CAPTCHAs or bot protection.
- **SEO (plan §6).** Every tool page passes the tool-page template and the CI
  self-audit. Arabic lives at the root, English at `/en`. Slugs are ASCII. User
  reports are always `noindex`. Never generate doorway pages.
- **Rules (plan §10).** TDD: the "wrong" fixture first, then the "right"
  fixture, then the detector. A rule is not done without both fixtures, a unit
  test, reviewed Arabic copy, and its rule-library page.
- **Plans (plan §3).** Plans and quotas live in `packages/plans` and are
  enforced in the API. Free single-page tools stay free and signup-free.
- **No invented numbers** in UI copy, READMEs, seed data, pricing, or reports.
- **Ask first:** deploying, publishing data, registering domains, setting up
  payments, bulk-crawling third-party sites, and every owner decision in plan
  §20. Single scans of sites the owner names are fine.

## Deployment target

First runs on the owner's existing server (8 vCPU / 16GB, shared with other
services) under Docker Compose/Coolify with a ~3.5GB RAM budget (plan §18.3.1).
Keep everything in Docker so it can move to its own server without code changes.

## Working style

Phase by phase (plan §17). Before each phase, post a short design (files,
packages, first rules, risks) and wait for approval. One PR per phase milestone,
small reviewable commits. Replace estimates in the plan's cost and SLO sections
with measured numbers as they come in.

---
title: "SPEC-191: Migrate Team AI Insights from -p to --bg subscription billing"
status: DRAFT
milestone: June 15 Migration
related:
  - "125-developer-team-insights"
  - "169-migrate-claude-invocation-to-bg-mode"
  - "190-ember-live-answers-subscription"
---

# SPEC-191: Migrate Team AI Insights from `-p` to `--bg` subscription billing

## Status: DRAFT

## Context

Team AI Insights (SPEC-125) generates the developer/team narrative by invoking Claude in headless mode (`--print` / `-p`). On 2026-06-15 the `-p`/`--print` path switches from subscription billing to Anthropic API-pool billing, so after that date this feature would silently route through the API and break ReviewFlow's core promise: no API key, ever — every Claude run stays on the operator's `claude /login` subscription. Reviews already migrated to `--bg` (SPEC-169) and dispatch background sessions on the subscription. This spec migrates Team AI Insights onto that same proven path, keeping the generated insights output identical.

## Rules

- Team AI Insights generation runs on the operator's Claude subscription only — never through an Anthropic API key.
- The insights run dispatches as a background session, the same way reviews are dispatched, instead of the headless `-p`/`--print` path.
- The generated insights content stays identical to today's output — only the transport that produces it changes.
- The Claude answer is read back from the completed background session transcript, then parsed into insights exactly as before.
- If an Anthropic API key is present in the environment, the insights run refuses to start (subscription-only safeguard).
- A background session that finished is cleaned up after its answer is read, so sessions do not accumulate.
- When the subscription is unavailable or the operator is not logged in, insights generation fails with a clear message instead of silently billing the API.
- An insights run that does not complete within its time budget is stopped and reported as failed, not left hanging.
- No production code path may invoke `claude -p` or `claude --print` for insights after this migration.

## Scenarios

- nominal: {stats: "présentes", subscription: "logged-in"} → insights générés via session `--bg` + contenu identique à l'ancien rendu
- answer read from transcript: {session: "terminée", transcript: "réponse JSON présente"} → insights parsés depuis le transcript + status "completed"
- session cleaned up: {session: "terminée et lue"} → session arrêtée et supprimée
- no stats: {stats: "aucune review"} → reject "Aucune statistique de review disponible pour ce projet"
- not logged in: {subscription: "logged-out"} → reject "Impossible de générer les insights — connexion à l'abonnement Claude requise"
- api key present: {anthropicApiKey: "set"} → reject "Impossible de générer les insights — l'abonnement Claude est requis, pas de clé API"
- timeout: {session: "ne se termine pas dans le délai"} → session arrêtée + reject "La génération des insights a expiré"
- no remaining -p: {codebase: "src/**"} → aucun `claude -p` ni `claude --print` dans le chemin insights

## Out of Scope

- Changing what the insights contain (metrics, categories, levels, titles, strengths/weaknesses/tips) — output stays identical.
- The dashboard rendering of insights (presenter and views are untouched).
- The prompt content used to generate insights — only the transport changes.
- Multi-LLM / non-Claude providers.
- Re-architecting the reviews `--bg` dispatch path — this spec reuses it, it does not redesign it.
- Streaming partial insights to the dashboard — insights remain a single completed result.

## Glossary

| Term | Definition |
|------|------------|
| Team AI Insights | The SPEC-125 feature that turns review statistics into a developer/team narrative via Claude. |
| Headless mode | The `claude --print` / `-p` one-shot invocation that becomes API-billed on 2026-06-15. |
| Background session (`--bg`) | The subscription-billed dispatch already used by reviews; the answer is read from the session transcript. |
| Transcript | The session's JSONL file under the operator's Claude projects directory, holding the assistant answer. |
| Subscription | The operator's Claude login (OAuth) — the only authorized billing path for any Claude run. |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Reuses the existing reviews `--bg` dispatch path (SPEC-169); no dependency on an in-flight spec. |
| Negotiable | OK | The "what" is fixed (subscription transport, identical output); how the answer is read/cleaned up is left to implementation. |
| Valuable | OK | Keeps a shipped feature on the subscription past 2026-06-15, preserving the no-API-key guarantee. |
| Estimable | OK | One invoker swapped onto a proven path; clear inputs/outputs, no architectural unknowns. |
| Small | OK | Focused transport swap on the insights invoker; well under 15 files. Estimated ~0.5 jour IA. |
| Testable | OK | Every rule maps to a scenario; the `claude` binary and transcript read are mockable at the gateway boundary. |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.

- [ ] Team AI Insights dispatches via `--bg` on the subscription; no `-p`/`--print` remains in the insights path.
- [ ] Generated insights content is byte-for-byte equivalent to the previous headless output (same prompt, same parsing).
- [ ] Answer is read from the completed session transcript and parsed into insights.
- [ ] Finished sessions are stopped and removed after the answer is read.
- [ ] API-key-present and logged-out cases fail with the French messages above instead of billing the API.
- [ ] Timeout stops the session and reports failure.
- [ ] Acceptance test GREEN proves the spec is satisfied.
- [ ] `yarn verify` passes (typecheck + lint + test:ci).

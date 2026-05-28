---
title: "SPEC-190: Answer Ember questions live via the Claude subscription"
status: DRAFT
milestone: Ember Assistant
depends_on:
  - "189-ember-readonly-review-chat"
related:
  - "169-migrate-claude-invocation-to-bg-mode"
  - "172-claude-agents-supervisor-lifecycle"
---

# SPEC-190: Answer Ember questions live via the Claude subscription

## Status: DRAFT

## Context

Ember Phase A (SPEC-189) shipped the read-only chat UI and avatar, but the assistant never actually answers — every question returns "// EMBER INDISPONIBLE". Phase B makes Ember answer for real: each question runs as a one-shot background job on the operator's Claude subscription (the same billing path reviews already use), streaming the response back. No Anthropic API key, ever — the subscription is the only allowed path.

## Rules

- Ember answers only through the operator's Claude subscription — never an Anthropic API key.
- If an Anthropic API key is present in the environment, Ember refuses to answer (subscription-only safeguard).
- Each question is answered independently — there is no memory of previous questions yet.
- Each answer is grounded on the current project's review data (scores, insights, job history, worktrees).
- Grounding must succeed regardless of project size — a large review history must not make Ember fail.
- The answer streams progressively to the user as it is produced.
- An empty question is never sent.
- When the subscription is unavailable or the operator is not logged in, Ember shows a clear retry message instead of failing silently.
- When answering fails part-way through, the user can retry.
- Ember stays read-only — it never modifies reviews, threads, files, or any project state.

## Scenarios

- nominal: {question: "Quelles reviews sont en cours ?", subscription: "logged-in"} → streamed answer + status "idle"
- empty question: {question: ""} → rien envoyé, champ garde le focus
- large grounding: {question: "Résume mon historique", project: "gros historique de reviews"} → streamed answer (aucun échec)
- not logged in: {question: "Statut ?", subscription: "logged-out"} → reject "// EMBER INDISPONIBLE — réessayer" + retry visible
- mid-stream failure: {question: "Statut ?", failure: "pendant la réponse"} → reject "// EMBER INDISPONIBLE — réessayer" + retry visible
- api key present: {anthropicApiKey: "set"} → reject "// EMBER INDISPONIBLE — réessayer"

## Out of Scope

- Conversation memory / multi-turn threads (a later phase).
- Ember performing write actions (resolving threads, posting comments, editing files).
- The long-lived 24h supervised Ember session (SPEC-172 supervisor hosting).
- Cross-project questions — Ember answers about the currently scoped project only.
- Changing the Phase A chat UI or avatar.

## Glossary

| Term | Definition |
|------|------------|
| Grounding | The current project's review data injected so Ember answers from real context, not generic knowledge. |
| One-shot answer | A single background Claude run per question, with no persisted conversation thread between questions. |
| Subscription | The operator's Claude login (OAuth) — the only authorized way to bill Ember, like reviews. |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Reuses the existing `--bg` subscription path (reviews); no dependency on the SPEC-172 supervisor. |
| Negotiable | OK | Only the "what" is fixed; how grounding is delivered (so it survives large projects) is left open. |
| Valuable | OK | Ember finally answers — the whole point of the assistant. |
| Estimable | OK | Scope is the transport + grounding delivery; the streaming/subscription path already exists. |
| Small | OK | Reuses the proven `--bg` path; expected well under 15 files. |
| Testable | OK | Every rule maps to a scenario. |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.

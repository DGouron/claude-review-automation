---
title: "SPEC-190: Answer Ember questions live via the Claude subscription"
status: implemented
milestone: Ember Assistant
depends_on:
  - "189-ember-readonly-review-chat"
related:
  - "169-migrate-claude-invocation-to-bg-mode"
  - "172-claude-agents-supervisor-lifecycle"
---

# SPEC-190: Answer Ember questions live via the Claude subscription

## Status: implemented

See [plan](../plans/190-ember-live-answers-subscription.plan.md) and
[report](../reports/190-ember-live-answers-subscription.report.md).

## Implementation

Each question now spawns ONE `claude --bg` one-shot dispatch on the operator's Claude
subscription (the same path reviews use — never `--print`, which switches to API billing on
2026-06-15), grounded on a bounded system prompt, with the answer tailed from the session
transcript JSONL and streamed back over the existing SSE channel. No memory between questions;
the SPEC-189 long-lived-session machinery (registry, idle state machine, interactive stdin
transport) was removed.

### Artefacts
- **Entity** — `emberAnswer/emberAnswerTransport.gateway.ts` (one-shot transport port; no write method → read-only by construction).
- **Use case** — `askEmber` (no-API-key guard → bounded grounding → one-shot transport; `AnswerRelay` buffers chunks until the SSE subscriber attaches). `emberStream.ts` holds `EmberStatus`/`EmberStreamSubscriber`.
- **Service** — `buildEmberSystemPrompt` now **bounds** the grounding (recent N reviews/MRs/developers/worktrees + an aggregate note) so a large history never blows the context.
- **Gateway** — `emberAnswerTransport.claude.gateway.ts`: `--bg` dispatch (`--permission-mode plan`, read-only tools) + transcript-JSONL tail; done-detection via terminal line OR a `listAgents()` poll fallback. **Humble glue — not unit-tested; acceptance runs on the stub.**
- **Controller** — `emberChat.routes.ts` (`POST /api/ember/ask`, SSE; client `close` → `cancel()`).

### Endpoints
| Method | Route | Use case |
|--------|-------|----------|
| POST | `/api/ember/ask` | `askEmber` (API-key guard → bounded grounding → one-shot `--bg` dispatch → SSE `chunk`/`status`/`error`/`end`) |

### Decisions
- **`--bg`, never `-p`** — `--print`/headless switches to API billing on 2026-06-15; `--bg` keeps Ember on the subscription, consistent with reviews. No Anthropic API key, ever.
- **One-shot, no memory** — per spec; the SPEC-189 long-lived session + idle/revive was removed as dead weight.
- **Bounded grounding** — caps + aggregate summary instead of MCP read-tools (deferred, with `.md`/DSL memory, to a future Phase C spec).
- **Read-only structurally** — the transport port has no write method; the dispatch runs `--permission-mode plan` with a read-only tool whitelist.

### Manual verification (done — claude 2.1.154)
Verified live against a real `claude --bg` dispatch; the transport glue was corrected accordingly:
- `--permission-mode auto` (proven reviews path; read-only kept by tool whitelist/blacklist + no MCP).
- Transcript resolved by **prefix glob** `<shortId>*.jsonl` — the file uses the full UUID while `backgrounded · <id>` only gives the short prefix.
- Completion via `assistant` `stop_reason: end_turn` + `system` `turn_duration` (no `result` line exists); the `listAgents()` fallback was removed (a `--bg` session stays persistent/`idle` after answering) in favour of a bounded no-hang attempt budget; the session is stopped on done.
- A fresh dispatch produced a grounded streamed answer end-to-end.

Still open: drive the chat end-to-end in a browser (humble SSE client glue).

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

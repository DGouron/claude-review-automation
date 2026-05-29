---
title: "SPEC-192: Ground Ember on demand and remember per project"
status: implemented
milestone: Ember Assistant
depends_on:
  - "190-ember-live-answers-subscription"
related:
  - "189-ember-readonly-review-chat"
  - "169-migrate-claude-invocation-to-bg-mode"
  - "172-claude-agents-supervisor-lifecycle"
---

# SPEC-192: Ground Ember on demand and remember per project

## Status: implemented

See [plan](../plans/192-ember-ondemand-grounding-and-memory.plan.md). Delivered in three internal milestones over one acceptance test, all on stubs (no real `claude` process in CI).

## Implementation

### Milestone 1 — on-demand grounding (no new capability, a framing fix)
The transport already dispatches `claude --bg` with `allowedTools: 'Read,Glob,Grep'` over the project's `localPath`, so Ember could already read review data on disk. The recent-window ceiling lived only in the system prompt, which falsely claimed Ember had "aucun accès … système de fichiers" and that older reviews were "résumé agrégé seulement". `emberSystemPrompt` was reframed: the bounded snapshot is now a starting point (not a ceiling), Ember is told it may read any item on demand recent or old, and it must never refuse merely because data lies outside the snapshot. GROUNDING, no-invention and read-only clauses are kept.

### Milestone 2 — per-project durable conversation memory
- **Entity** — `entities/emberMemory/`: `emberMemory.schema.ts` (Zod, `{turns, insights}`), `emberMemory.guard.ts` (tolerant `safeParse`), `emberMemory.gateway.ts` (port: `load` / `appendTurn` / `appendInsight` / `clear` — the only write path Ember has, a private notebook, never project state).
- **Gateway** — `interface-adapters/gateways/emberMemory.fileSystem.gateway.ts`: one `.md` notebook per project at `~/.claude-review/ember-memory/<slug>.md` (slug = `projectPath` with `/`→`-`). `load` returns `null` on absent/corrupted/unreadable, never throws.
- **Use case** — `askEmber` reads memory before the prompt via `loadMemorySafely` (try/catch → `null`, so a failing memory can never kill the stream) and appends `{question, answer}` after the terminal `done` (best-effort; empty answers skipped, write failures swallowed).
- **Service** — `emberSystemPrompt` renders a "MÉMOIRE — conversation précédente" section when turns exist.
- **Controller / wiring** — `emberChat.routes` threads the memory dependency; `main/routes.ts` instantiates the filesystem gateway (DI in the composition root only).

### Milestone 3 — recurring insights + clear control
- **Schema** — `insights: string[]` (`.default([])`, so a legacy turns-only notebook still parses — corruption tolerance preserved); `appendInsight` on the port + filesystem gateway, normalizing `{turns, insights}` so neither field is lost.
- **Service** — `emberSystemPrompt` renders a "CONSTATS RÉCURRENTS" section instructing Ember to reuse recorded findings instead of recomputing.
- **Use case + endpoint** — `clearEmberMemory` (thin delegating function) + `POST /api/ember/memory/clear` → `200 {status:'cleared'}`.

### Endpoints
| Method | Route | Use case |
|--------|-------|----------|
| POST | `/api/ember/ask` | `askEmber` (unchanged path; now memory-aware: prior turns/insights injected, new turn appended after `done`) |
| POST | `/api/ember/memory/clear` | `clearEmberMemory` (empties the project's notebook) |

### Decisions
- **On-demand grounding is a prompt reframing, not a new gateway** — the read capability already existed; only the false ceiling was removed (anti-overengineering).
- **Memory is a private notebook under `~/.claude-review/`, never project state** — the transport port stays write-free, so read-only over the reviewed project is compile-enforced as before.
- **Corruption is non-fatal everywhere** — both the gateway (`load` → `null`) and the use case (`loadMemorySafely`) tolerate absent/corrupted memory; error events come only from the transport.
- **Automatic insight *derivation* is deferred (honest scope cut).** The notebook can hold recurring insights and surfaces them for reuse (`appendInsight` + prompt section + acceptance), but Ember does not yet auto-detect a recurring finding from its own one-shot `--bg` output — the transport tails free-form transcript text with no structured "this is a recurring finding" signal, and parsing prose would be an untestable guess. The natural follow-up is an explicit MCP tool the model calls to record an insight, mirroring the review path's `add_action`. The "reused insight" scenario is satisfied by a pre-recorded insight, not by faked derivation.

### Tests
3044 tests green (384 files); `yarn verify` clean. The 192 acceptance carries all nine scenarios (on-demand grounding, no window-refusal, follow-up across restart, per-project isolation, reused insight, clear, corrupted memory non-fatal, read-only preserved, api-key refusal) on stubs; the 190 acceptance stays unchanged and green.

## Context

Phase B (SPEC-190) answers each question independently from a bounded snapshot (recent N reviews/MRs/developers/worktrees + an aggregate note), so Ember cannot dig into a specific older review and forgets everything between questions. Phase C lets Ember reach the exact review data a question needs on demand — with no recent-window ceiling — and keep a per-project memory of past conversation turns and the recurring insights it derived, so follow-ups keep context and repeated findings are not recomputed. Ember stays strictly read-only over project state and answers only through the operator's Claude subscription.

## Rules

- Ember can reach any of the project's review data on demand, not only the most recent items, so a question about a specific older review is answerable.
- A question is never refused merely because the relevant data falls outside a recent window.
- Ember keeps one memory per project; a project's memory is never mixed with another project's.
- Across questions and across restarts, Ember remembers the conversation: a follow-up may refer to an earlier answer without repeating the subject.
- Ember records recurring findings it derives from review data, and may reuse a recorded finding instead of recomputing it.
- Memory is read back at answer time, so a follow-up reflects what was actually said and found before.
- When neither the live review data nor its memory holds the answer, Ember says it does not know rather than inventing one.
- Ember stays strictly read-only over project state — its memory is a private notebook, never a write to reviews, threads, files, or configuration.
- Memory survives a restart of Ember and of the dashboard — it is persisted, not kept only in memory.
- The operator can clear a project's Ember memory.
- A corrupted or unreadable memory never blocks an answer — Ember answers without it.
- Ember answers only through the operator's Claude subscription — never an Anthropic API key; if an API key is present it refuses to answer.

## Scenarios

- old specific review on demand: {question: "Pourquoi MR-42 a-t-elle été bloquée il y a 3 mois ?", data: "hors fenêtre récente"} → streamed answer grounded in that specific review
- no recent-window refusal: {question: "Liste toutes les reviews de février", data: "au-delà du plafond récent"} → streamed answer couvrant février, aucun refus lié à la fenêtre
- follow-up across restart: {previous: "réponse sur projet X", restart: "dashboard relancé", question: "Et le mois dernier ?"} → answer about projet X for last month, subject not repeated
- reused insight: {memory: "projet X régresse chaque vendredi", question: "Quoi de neuf sur X ?"} → answer reprend le constat récurrent sans le recalculer
- per-project isolation: {projectA memory: "constat sur A", question asked in projectB} → la réponse de projectB ne référence jamais la mémoire de projectA
- unknown beyond data and memory: {question: "Quelle est la météo demain ?"} → Ember répond qu'il ne sait répondre qu'à propos des reviews, aucune invention
- read-only preserved: {question: "Crée un quality gate à 80 pour le projet X"} → aucune écriture sur l'état projet, Ember explique qu'il reste en lecture seule
- clear memory: {action: "effacer la mémoire du projet"} → mémoire vidée + la question suivante repart sans contexte antérieur
- corrupted memory: {memory: "fichier illisible", question: "Statut ?"} → réponse fournie sans la mémoire, aucun blocage
- api key present: {anthropicApiKey: "set"} → reject "// EMBER INDISPONIBLE — réessayer"

## Out of Scope

- Operator preferences / facts memory ("réponds toujours en FR", seuils de gate préférés) — a later concern, not this spec.
- Cross-project questions or a single global memory — memory stays per-project, carried from SPEC-190.
- Ember performing any write on project state (resolving threads, posting comments, editing files, changing configuration) — still strictly read-only.
- Inspecting or hand-editing memory contents through the UI — only a clear control is offered.
- The long-lived 24h supervised Ember session (SPEC-172 supervisor hosting).
- Multi-user or remote access — local dashboard, single operator.
- Changing the Phase A chat UI or avatar.

## Glossary

| Term | Definition |
|------|------------|
| On-demand grounding | Ember fetches the exact review data a question needs at answer time, instead of relying only on a pre-injected bounded snapshot. |
| Per-project memory | A persisted notebook, one per reviewed project, holding past conversation turns and recurring insights; never shared across projects. |
| Recurring insight | A finding Ember derived from review data (e.g. a project that regresses every Friday) and recorded to reuse without recomputing. |
| Conversation memory | The retained question/answer history that lets a follow-up keep context across questions and across restarts. |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Builds on Phase B's `--bg` subscription path (implemented); no in-flight dependency. |
| Negotiable | OK | Fixes the WHAT (on-demand reach, per-project durable memory, multi-turn); the HOW (read-tools vs in-process allowlist, memory file format) is left open. |
| Valuable | OK | Removes Phase B's two biggest limits — answering about any review, and keeping context between questions. |
| Estimable | WARN | Durable memory format and read-on-demand wiring are new; bounded by reusing the existing `--bg` path and read gateways. |
| Small | WARN | Bundles on-demand grounding + durable memory + multi-turn by the operator's explicit choice; likely above the ~15-file guide. Mitigated by the internal milestones below; flagged honestly rather than hidden. |
| Testable | OK | Every rule maps to a scenario; persistence, per-project isolation, clear, and corruption each have one. Answer generation stays humble glue — acceptance asserts grounding + memory effects, not exact wording. |

Verdict: **READY (pending user validation)** — no KO; Small/Estimable WARN tracked by the internal staging below.

## Notes for implementation (non-normative)

Recorded so the planner does not relitigate the framing:

- The operator chose to keep on-demand grounding and durable memory in **one** Phase C spec, after being shown the split option (Phase C grounding / Phase D memory). To protect INVEST-Small in practice, implement in internal milestones, each shippable behind the same acceptance: (1) on-demand grounding (lift the recent-window cap), (2) conversation memory persisted per project across restarts, (3) recorded recurring insights + the clear control.
- Memory is **per project** and persisted as a `.md`/DSL notebook (consistent with the Ember vision); read back at answer time, written by Ember as its own notebook — never a write to project state.
- Memory content is limited to conversation turns + derived recurring insights. Operator preferences/facts were explicitly excluded (Out of Scope).
- Read-only stays compile-enforced where it already is (the transport port has no write method); the memory notebook is the only thing Ember writes, and it is not project state.

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist. Specific to this spec:

- [ ] A question about a specific older review (outside the recent window) is answered from that review's data — verified by test
- [ ] No question is refused for falling outside a recent window — verified by test
- [ ] A follow-up keeps context after Ember/dashboard restart, without repeating the subject — verified by test
- [ ] A recorded recurring insight is reused without recomputation — verified by test
- [ ] One project's memory never leaks into another project's answer — verified by test
- [ ] The operator can clear a project's memory; the next question starts without prior context — verified by test
- [ ] A corrupted memory does not block answering — verified by test
- [ ] No write path on project state exists; the API-key safeguard from Phase B still refuses — verified by test
- [ ] Acceptance test: a scripted multi-turn session over fixed review data asserts on-demand grounding on an out-of-window item + memory carried across a simulated restart

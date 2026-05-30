# Plan — SPEC-192: Ground Ember on demand and remember per project (Phase C)

```
PLAN:
  scope: Ember Phase C — on-demand grounding + per-project durable memory
  is_new_module: false   # extends existing src/modules/ember-chat/
  source_of_truth: docs/specs/192-ember-ondemand-grounding-and-memory.md
  staging: 3 internal milestones (operator's explicit choice — one spec, shippable in slices behind one acceptance)
```

## Anti-overengineering verdict (read before planning)

The biggest scope risk in this spec is **inventing structure that already exists**. Concretely:

- The real transport (`emberAnswerTransport.claude.gateway.ts`) **already** dispatches `claude --bg` with
  `allowedTools: 'Read,Glob,Grep'` and the project `localPath`. Claude can therefore *already* read the project's
  review-data files on disk at answer time. **On-demand grounding is not a new capability of the transport** — it is
  already physically possible. What blocks it is purely the **system-prompt framing**: `emberSystemPrompt.ts` says
  *"TES SEULES SOURCES DE DONNÉES sont ces données ... Tu n'as aucun autre accès : ni système de fichiers, ni outil,
  ni réseau"* and pre-injects a hard-capped snapshot (`MAX_RECENT_REVIEWS = 20`, plus a *"… reviews plus anciennes
  (résumé agrégé seulement)"* note that actively tells Ember the older data is unreachable).
- **Conclusion for milestone 1**: the fix is to (a) lift the recent-window framing and (b) tell Ember it MAY read the
  on-disk review-data files for the current project when the question needs an item outside the injected window.
  No new entity, no new gateway, no new use case. This keeps milestone 1 to ~3 changed files + tests.
- Read-only stays **compile-enforced**: `EmberAnswerTransportGateway` has no write method, and `disallowedTools`
  already lists `Edit,Write,Bash,Task`. We do NOT add a write to the transport. The memory notebook (milestones 2/3)
  is the ONLY thing Ember writes, via a **separate** memory gateway, and it is a private notebook, never project state.

## Rule → layer → scenario map

| Spec Rule | Milestone | Layer | File(s) | Scenario(s) |
|-----------|-----------|-------|---------|-------------|
| Reach any review data on demand, not only recent | 1 | Service (system prompt) | `services/emberSystemPrompt.ts` | old specific review on demand |
| Never refused for falling outside a recent window | 1 | Service (system prompt) | `services/emberSystemPrompt.ts` | no recent-window refusal |
| Says "I don't know" beyond data + memory | 1 (kept) / 2 | Service | `services/emberSystemPrompt.ts` | unknown beyond data and memory |
| Strictly read-only over project state | 1 (kept) | Entity (port) + Gateway | `entities/emberAnswer/emberAnswerTransport.gateway.ts` (no write method), claude gateway `disallowedTools` | read-only preserved |
| API key → refuse | 1 (kept, regression) | Use case | `usecases/askEmber/askEmber.usecase.ts` (already there) | api key present |
| One memory per project, never mixed | 2 | Entity (port) + Gateway | `entities/emberMemory/emberMemory.gateway.ts`, `gateways/emberMemory.fileSystem.gateway.ts` | per-project isolation |
| Remembers conversation across questions + restarts | 2 | Entity + Use case + Gateway | memory entity/guard/gateway + `askEmber.usecase.ts` | follow-up across restart |
| Memory read back at answer time | 2 | Use case + Service | `askEmber.usecase.ts` reads memory → `emberSystemPrompt.ts` injects it | follow-up across restart |
| Memory persisted (survives restart) | 2 | Gateway (filesystem) | `gateways/emberMemory.fileSystem.gateway.ts` | follow-up across restart |
| Corrupted/unreadable memory never blocks answer | 2 | Gateway + Use case (null-on-failure) | filesystem gateway returns `null`, use case proceeds | corrupted memory |
| Records recurring insights, reuses without recompute | 3 | Entity + Gateway + Use case | memory entity (insight turn type) + write-back path | reused insight |
| Operator can clear a project's memory | 3 | Use case + Controller + Gateway | `usecases/clearEmberMemory/`, route in `emberChat.routes.ts`, gateway `clear()` | clear memory |

## Existing files — exactly what changes (reuse, do not duplicate)

| File | Milestone | Change |
|------|-----------|--------|
| `src/modules/ember-chat/services/emberSystemPrompt.ts` | 1 | Lift the "seule source / aucun accès fichiers" framing; remove the cap-as-ceiling note; add a clause that Ember MAY read the project's on-disk review-data files for the current project to answer about an item outside the injected window; keep the bounded snapshot as a *starting context*, not a ceiling. Add a memory section (M2). Keep grounding/"I don't know"/read-only clauses. |
| `src/modules/ember-chat/usecases/askEmber/askEmber.usecase.ts` | 2 | Inject `memory: EmberMemoryGateway` into `AskEmberDependencies`; read memory (`load(projectPath)`) before building the prompt; pass it to `buildEmberSystemPrompt`; after `onDone`, append the turn to memory (write-back). All memory reads tolerate `null`. No change to the API-key/read-only guards. |
| `src/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.ts` | — | NO change. Stays write-free (compile-enforced read-only). |
| `src/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.ts` | 1 | NO structural change. Already dispatches `--bg` with `Read,Glob,Grep` + project `localPath`. Optionally widen comment; tools stay read-only. |
| `src/modules/ember-chat/interface-adapters/controllers/http/emberChat.routes.ts` | 2/3 | Add `memory` to `EmberChatRoutesOptions` and pass to `askEmber`; add `POST /api/ember/memory/clear` route (M3). |
| `src/main/routes.ts` | 2 | Instantiate `EmberMemoryFileSystemGateway` and pass into `emberChatRoutes` (composition root only). |

---

## MILESTONE 1 — On-demand grounding (lift the recent-window cap)  [DETAILED]

Goal: a question about a specific older review (outside the injected window) is answerable, and no question is
refused merely for falling outside a recent window. **No new entity/gateway/use case** — the change is in the
system-prompt framing only.

Inside-out TDD order:

```
1. src/tests/units/modules/ember-chat/services/emberSystemPrompt.test.ts   (EXTEND — RED first)
   - Add: "does not declare on-disk files off-limits" — assert the prompt no longer claims
     "aucun accès ... système de fichiers" and no longer caps with the "résumé agrégé seulement" ceiling note.
   - Add: "permits reading the project's review-data files on demand for out-of-window items"
     — assert the prompt contains an explicit on-demand-read clause scoped to the current project.
   - Keep existing assertions: bounded snapshot still present (totalReviews aggregate), length < 60_000,
     grounding + "I don't know" + read-only clauses intact.

2. src/modules/ember-chat/services/emberSystemPrompt.ts                     (EDIT — GREEN)
   - Replace the "seule source / aucun accès fichiers" wording with: injected snapshot = starting context,
     and Ember MAY read the project's on-disk review-data for items beyond it.
   - Remove reviewCountSummary's ceiling phrasing (keep an aggregate count line, drop "résumé agrégé seulement").
   - Keep boundReviewScores/boundInsights/boundJobHistory as a *prompt-size guard* (cost control), NOT a reach ceiling.

3. src/tests/units/modules/ember-chat/usecases/askEmber.usecase.test.ts    (EXTEND — verify regression)
   - Add: out-of-window question still returns 'streaming' (no refusal path exists for window).
   - Confirm api-key refusal + read-only (transport has no write) regressions remain green.

4. src/tests/acceptance/192-ember-ondemand-grounding-and-memory.acceptance.test.ts  (NEW — outer loop, RED→GREEN)
   - Milestone-1 slice: with largeReviewData() (500 reviews, MR-42 well outside the 20 window),
     answerFromSystemPrompt() proves the prompt no longer fences off MR-42 and no window-refusal text appears.
   - Runs entirely on StubEmberAnswerTransportGateway — NO real claude process.
```

Files touched in milestone 1: **2 production** (`emberSystemPrompt.ts`, optional comment in claude gateway)
+ **3 test** (`emberSystemPrompt.test.ts` extend, `askEmber.usecase.test.ts` extend, new `192` acceptance).
Net new files: **1** (the 192 acceptance test). Changed files: **2–3**. Well under the 15-file guide.

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/192-ember-ondemand-grounding-and-memory.acceptance.test.ts
  note: "SDD outer loop — added for 192, grows across milestones. M1: out-of-window item reachable, no window refusal.
         M2: memory carried across a simulated restart (new gateway instance, same fs path). Runs on stubs only.
         The existing 190 acceptance test stays UNCHANGED and GREEN."
```

---

## MILESTONE 2 — Conversation memory persisted per project across restarts  [OUTLINE]

New entity (port + schema + guard), filesystem gateway, stub, factory; wire into `askEmber` + prompt + routes + DI.

```
ENTITIES:
  - name: EmberMemory (+ EmberMemoryTurn)
    schema:  src/modules/ember-chat/entities/emberMemory/emberMemory.schema.ts
             (turns: question/answer pairs; recurring insights added in M3; absence = null, never undefined)
    guard:   src/modules/ember-chat/entities/emberMemory/emberMemory.guard.ts   (createGuard, tolerant safeParse)
    gateway_contract: src/modules/ember-chat/entities/emberMemory/emberMemory.gateway.ts
       methods: load(projectPath): Promise<EmberMemory | null>          # null on absent/corrupted — never throws to caller
                appendTurn(projectPath, turn): Promise<void>            # the ONLY write Ember performs (private notebook)
                clear(projectPath): Promise<void>                       # M3
    test:    src/tests/units/modules/ember-chat/entities/emberMemory.guard.test.ts
    factory: src/tests/factories/emberMemory.factory.ts

GATEWAYS:
  - name: EmberMemoryFileSystemGateway
    implementation: src/modules/ember-chat/interface-adapters/gateways/emberMemory.fileSystem.gateway.ts
    stub:           src/tests/stubs/emberMemory.stub.ts
    storage: per-project .md/DSL notebook, isolated by projectPath:
             <homeDir>/.claude-review/ember-memory/<slug(projectPath)>.md
             (slug = projectPath.replace(/\//g,'-'), same scheme the claude gateway already uses)
             Per-project isolation = one file per slug. Corruption tolerance = parse failure returns null.
    test: src/tests/units/modules/ember-chat/gateways/emberMemory.fileSystem.gateway.test.ts
          (round-trip persists; new instance over same path reloads = "restart"; bad file → load() null, no throw)

USECASE CHANGES (askEmber.usecase.ts):
  - AskEmberDependencies += memory: EmberMemoryGateway
  - before prompt: const memory = await deps.memory.load(projectPath)   // tolerate null
  - buildEmberSystemPrompt({ ...grounding, memory })                     // prompt injects prior turns
  - on terminal done: await deps.memory.appendTurn(projectPath, { question, answer })  // write-back, best-effort

SERVICE CHANGE (emberSystemPrompt.ts):
  - add a "MÉMOIRE (tours précédents de cette conversation)" section; absent memory → omit cleanly.

CONTROLLER + DI:
  - emberChat.routes.ts: EmberChatRoutesOptions += memory; pass to askEmber.
  - routes.ts: new EmberMemoryFileSystemGateway({ homeDir: homedir() }) → emberChatRoutes.

TESTS:
  - askEmber.usecase.test.ts: follow-up reads prior turn; per-project isolation (memory of A absent for B);
    corrupted memory (gateway load → null) still streams.
  - 192 acceptance: simulate restart = ask Q1 with a fresh memory gateway instance, then construct a NEW gateway
    instance over the same backing store and ask a follow-up; assert subject from Q1 available without repetition.

File estimate M2: schema, guard, gateway-contract (3 entity) + fs gateway (1) + stub + factory (2)
  + guard test, fs gateway test, usecase test extend (3) + edits to askEmber/emberSystemPrompt/routes(http)/routes(main) (4 edits).
  New files ≈ 8, edits ≈ 4.
```

## MILESTONE 3 — Recorded recurring insights + clear control  [OUTLINE]

Extends the M2 memory entity with a recurring-insight turn kind, plus a clear use case + route.

```
ENTITY CHANGE:
  - emberMemory.schema.ts: add a discriminated turn kind for recurring insights (conversation turn | recurring insight).

USECASE (new, thin):
  - src/modules/ember-chat/usecases/clearEmberMemory/clearEmberMemory.usecase.ts
    → calls memory.clear(projectPath). One service call — kept a function, not a class (anti-overengineering).
  - test: src/tests/units/modules/ember-chat/usecases/clearEmberMemory.usecase.test.ts

SERVICE:
  - emberSystemPrompt.ts: render recorded recurring insights so Ember can reuse without recomputing.

CONTROLLER:
  - emberChat.routes.ts: POST /api/ember/memory/clear → clearEmberMemory; 200 on success.
  - test: emberChat.routes.test.ts extend.

GATEWAY:
  - emberMemory.gateway.ts already declares clear(); fs gateway implements (delete/empty file).

TESTS:
  - reused insight: memory seeded with a recurring insight → answer reflects it (acceptance/usecase).
  - clear memory: after clear(), next question starts with empty memory section.

File estimate M3: clear usecase (1) + its test (1) + schema edit + service edit + route edit + route test edit
  + fs gateway clear test. New files ≈ 2, edits ≈ 5.
```

---

## File count summary

| Milestone | New files | Edited files |
|-----------|-----------|--------------|
| M1 on-demand grounding | 1 (192 acceptance) | 2–3 |
| M2 per-project memory | ~8 | ~4 |
| M3 recurring insights + clear | ~2 | ~5 |
| **TOTAL** | **~11 new** | **~6 distinct edited** (some edited across milestones) |

- **Milestone 1 alone**: ~3–4 files — comfortably under the 15-file guide. This is the cheapest, highest-value slice
  (it is purely framing) and should ship first.
- **Whole spec**: ~11 new + ~6 edited ≈ **17 files touched** — at the upper edge of the ~15–20 guide, exactly as the
  spec's INVEST "Small: WARN" flagged. The milestone staging keeps each PR small; the total is inherent to bundling
  on-demand grounding + durable memory in one spec (operator's explicit decision, recorded non-normatively in the spec).

## Scope risks to watch

1. **Do not add a write method to the transport port** — read-only is compile-enforced there; the memory write lives
   on a separate `EmberMemoryGateway`. Reviewer must confirm `emberAnswerTransport.gateway.ts` is unchanged.
2. **Memory must never be project state** — store under `~/.claude-review/ember-memory/`, never inside the reviewed
   repo. It is Ember's private notebook.
3. **Corruption tolerance is a hard rule** — `load()` returns `null` on any parse/read failure; the use case must never
   let a memory failure break answering (mirror the existing api-key/dispatch null-tolerant style).
4. **Per-project isolation** comes from one file per `slug(projectPath)`; a single global file would violate the spec.
5. **M1 framing must not over-promise tools** — keep `allowedTools` at `Read,Glob,Grep` only; the prompt invites
   reading the project's *review-data* files, not arbitrary network/tool access.
6. The current `routes.ts` picks `projectPath` from the first enabled repository only; multi-project memory selection
   (which project the chat is "in") is pre-existing behaviour and out of this spec's scope — note it, do not expand it.

## Reference files

- `docs/specs/192-ember-ondemand-grounding-and-memory.md` — source of truth (Rules + Scenarios + non-normative notes).
- `src/modules/ember-chat/services/emberSystemPrompt.ts` — the cap + framing to lift (M1 core).
- `src/modules/ember-chat/usecases/askEmber/askEmber.usecase.ts` — extension point for memory read/write (M2).
- `src/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.ts` — write-free port (read-only proof).
- `src/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.ts` — already `--bg` + Read/Glob/Grep + localPath.
- `src/modules/ember-chat/interface-adapters/gateways/emberReadData.composite.gateway.ts` — pattern for the new fs memory gateway.
- `src/tests/stubs/emberAnswerTransport.stub.ts` + `src/tests/stubs/emberReadData.stub.ts` — stub patterns to mirror for the memory stub.
- `src/tests/acceptance/190-ember-live-answers-subscription.acceptance.test.ts` — pattern for the new 192 acceptance (stays green).
- `src/main/routes.ts` (lines ~36–38, ~464–482) — composition root wiring for Ember.
```

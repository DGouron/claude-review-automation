# Cap parallel reviews per project

## Status: implemented

See [report](../reports/186-per-project-concurrency-cap.report.md) and [plan](../plans/186-per-project-concurrency-cap.plan.md).

## Implementation

**Artefacts**:
- Value object: `src/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.{schema,valueObject,guard}.ts` — range [1, 10], default 2, French error message constants shared by the server validator and the dashboard humble module.
- Use case: `src/modules/cli-configuration/usecases/projectConfig/recomputeGlobalConcurrency.usecase.ts` — sums per-project effective caps, propagates them to the per-project semaphore and sets the global PQueue concurrency.
- Gateway: `RepositoriesListGateway` contract + `RepositoriesListRuntimeConfigGateway` impl, wrapping the runtime config repositories list.
- Runtime primitive: `src/frameworks/queue/projectSemaphore.ts` — per-project acquire/release/setCapacity that holds new reviews when a project is at its cap, releases queued ones when the cap is raised, and does NOT interrupt running reviews when the cap is lowered.
- Queue adapter extension: `pQueueAdapter.ts` exposes `setProjectConcurrencyCap`, `setGlobalConcurrency`, `getRunningCount`, `getTotalCapacity`. The semaphore is acquired between the existing MR-chain serialization and `PQueue.add()`, and released in the same `finally` block as `activeJobs` cleanup.
- HTTP route: `PATCH /api/project-config` accepts `maxConcurrentReviews` (number, stringified integer, or `""` for "required" rejection) and triggers an `onSaved` hook that re-executes `RecomputeGlobalConcurrencyUseCase`.
- Overview API: `GET /api/overview` now exposes `capacity: { running, max }` and the presenter emits a `headerCapacity` viewmodel (`label: "N / M"`, `isSaturated`).
- Dashboard: `src/dashboard/modules/headerCapacityBadge.js` (pure module) + `#header-capacity-badge-slot` rendered in the header, refreshed at boot and after each settings save. Settings modal exposes a numeric input (1-10) and validates it client-side via `validateMaxConcurrentReviews` mirroring server rules.

**Architectural decisions**:
- The global PQueue concurrency is derived: `pQueue.concurrency = Σ effective per-project caps`. The legacy `config.queue.maxConcurrent` is kept only as a boot-time fallback before the first recompute.
- The recompute is fired on every successful PATCH (no diffing). O(repositories), local I/O — simpler than tracking field changes.
- Per-project enforcement uses a dedicated semaphore primitive instead of N separate PQueues, to preserve the existing MR-chain serialization and dedup logic.
- Lowering a cap does NOT interrupt running reviews — only the next ones are queued until the running count drops below the new cap.
- `Math.max(totalCapacity, 1)` is the boot floor when no projects are declared, so a future review can still run on a fresh install.

**Endpoints**:

| Method | Route | Use case |
|--------|-------|----------|
| PATCH | `/api/project-config` | `UpdateProjectConfigUseCase` (accepts `maxConcurrentReviews`) + `RecomputeGlobalConcurrencyUseCase` via `onSaved` hook |
| GET | `/api/overview` | Overview presenter exposes `headerCapacity` (`running / max`, `isSaturated`) |

## Context

A single project can today saturate the global review queue and starve the others, because the concurrency limit is global (shared across all projects). The user must be able to set, per project, how many of its reviews can run at the same time, and see at a glance how many reviews the machine can handle in total across all projects.

## Rules

- Each project owns a `maxConcurrentReviews` setting persisted in its own project configuration.
- A project without an explicit value uses a default of 2 concurrent reviews.
- The accepted range for `maxConcurrentReviews` is 1 (minimum) to 10 (maximum), inclusive.
- The setting is editable from the project settings modal as a numeric input.
- A value outside the accepted range is rejected with a French error message at save time, on both client validation and server validation.
- A non-numeric value is rejected with a French error message.
- An empty value is rejected with a French error message.
- A new value is persisted to the project configuration file the moment the user saves the modal.
- At any moment, the number of concurrently running reviews for a given project is at most equal to that project's current `maxConcurrentReviews`.
- A new incoming review for a project that has already reached its cap is held (queued) until one of its running reviews finishes.
- Lowering the cap while reviews are already running does not interrupt the running reviews; the new cap applies only to the next reviews that would start.
- Raising the cap immediately allows queued reviews of that project to start, up to the new cap.
- The total parallel-review capacity displayed in the dashboard header equals the sum of `maxConcurrentReviews` across all projects declared in the runtime configuration.
- The total currently-running count displayed in the dashboard header equals the number of reviews in running state across all projects.
- The header indicator shows both numbers in the form "running / total", visible on every dashboard page load and updated on each overview refresh.
- The runtime engine recomputes the global capacity whenever a project's cap is changed and whenever the set of declared projects changes (project added or removed).

## Scenarios

- valid update: {projectPath: "/home/user/proj", maxConcurrentReviews: 4} → status "saved" + persisted "4"
- value too low: {projectPath: "/home/user/proj", maxConcurrentReviews: 0} → reject "La valeur doit être comprise entre 1 et 10"
- value too high: {projectPath: "/home/user/proj", maxConcurrentReviews: 11} → reject "La valeur doit être comprise entre 1 et 10"
- value negative: {projectPath: "/home/user/proj", maxConcurrentReviews: -1} → reject "La valeur doit être comprise entre 1 et 10"
- value non integer: {projectPath: "/home/user/proj", maxConcurrentReviews: 2.5} → reject "La valeur doit être un nombre entier"
- value not a number: {projectPath: "/home/user/proj", maxConcurrentReviews: "abc"} → reject "La valeur doit être un nombre entier"
- value empty: {projectPath: "/home/user/proj", maxConcurrentReviews: ""} → reject "La valeur est obligatoire"
- missing key falls back: {projectPath: "/home/user/proj", config: {no maxConcurrentReviews}} → effective cap "2"
- enforce cap at runtime: {projectCap: 2, currentlyRunning: 2, newReview: "incoming"} → status "queued"
- below cap accepts new review: {projectCap: 3, currentlyRunning: 2, newReview: "incoming"} → status "running"
- lower cap with running reviews: {projectCap: 4, currentlyRunning: 4, updateTo: 2} → status "saved" + runningReviews "unchanged" + nextReview "queued until running drops below 2"
- raise cap releases queued: {projectCap: 2, currentlyRunning: 2, queued: 3, updateTo: 4} → released "2" + stillQueued "1"
- total capacity equals sum: {projects: [{cap: 2}, {cap: 3}, {cap: 1}]} → header max "6"
- header reflects running count: {projects: [{running: 1, cap: 2}, {running: 2, cap: 3}]} → header "3 / 5"
- saturated header at full load: {projects: [{running: 2, cap: 2}, {running: 3, cap: 3}]} → header "5 / 5" + saturation indicator
- new project adds to total: {existingTotal: 5, addedProject: {cap: 3}} → header max "8"
- project removed shrinks total: {existingTotal: 8, removedProject: {cap: 3}} → header max "5"

## Out of Scope

- Bulk edition of `maxConcurrentReviews` across several projects in one action.
- Killing or pausing reviews that are already running when the cap is lowered.
- A scheduling mechanism to time-shift cap changes (e.g., "increase cap at 9am").
- Separate caps for fresh reviews vs follow-up reviews.
- Per-MR concurrency override.
- Persistence of historical capacity usage (the header is a live indicator only).
- A global hard ceiling on top of the sum of per-project caps.
- Visual cap indicator on individual project cards (header only, on purpose).
- i18n of the header label beyond the existing dashboard locale system.

## Glossary

| Term | Definition |
|------|------------|
| Per-project cap | The `maxConcurrentReviews` value attached to a single project, limiting how many of its reviews can run simultaneously. |
| Effective cap | The cap actually used at runtime for a project: its explicit value, or the default of 2 if the key is absent. |
| Total capacity | The sum of effective caps across all projects declared in the runtime configuration. Displayed as the "max" half of the header indicator. |
| Header capacity indicator | The "running / total" badge in the dashboard header, refreshed on each overview poll. |
| Saturation | The state where the running count equals the total capacity; visually distinguished in the header. |
| Runtime configuration | The list of projects known to the daemon (`~/.claude-review/config.json`), used to determine which projects contribute to the total capacity. |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | No dependency on another in-flight spec. Builds on the existing settings modal and overview endpoint without blocking them. |
| Negotiable | OK | Behaviors are fixed (cap range, fallback, header format) but the "how" — semaphore implementation, PQueue concurrency recomputation strategy, header DOM placement — stays free. |
| Valuable | OK | Solves a real starvation problem and surfaces previously hidden machine capacity to the operator. |
| Estimable | OK | Mirrors patterns of specs 179 (settings modal) and 180 (project config validation). Bounded number of new artefacts. |
| Small | OK | ~7-10 files: schema extension, guard update, settings modal whitelist + input, route validation, runtime semaphore wrapper, overview presenter, dashboard header partial. |
| Testable | OK | Every rule has at least one DSL scenario; cap arithmetic and runtime enforcement are state-verifiable. |

Verdict: **READY**.

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.

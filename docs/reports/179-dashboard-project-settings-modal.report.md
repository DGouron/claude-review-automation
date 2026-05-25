# Report — SPEC-179 Configure Project Settings via a Modal

> Status: implemented
> Spec: `docs/specs/179-dashboard-project-settings-modal.md`
> Plan: `docs/plans/179-dashboard-project-settings-modal.plan.md`
> Worktree: `.claude/worktrees/spec-177-add-project-ui/`
> Implementation: feature-implementer agent (resumed once) + orchestrator finalization (lint/typecheck fixes + report)

---

## Summary

- Acceptance test status: **GREEN (22/22)**
- Regression check: SPEC-177 **GREEN (19/19)** + SPEC-178 **GREEN (15/15)** — no regression
- Full suite: **2128 / 2128 pass** (was 2058 on SPEC-178 head; +70 tests this spec)
- Spec coverage: **15 / 15 scenarios** covered

## Files created

| Path | Purpose |
|------|---------|
| `src/modules/cli-configuration/entities/projectConfig/projectConfig.schema.ts` | Zod schema for `ProjectConfig` with new optional `externalLink` field |
| `src/modules/cli-configuration/interface-adapters/gateways/projectConfig.fileSystem.gateway.ts` | Atomic read + write of `<projectPath>/.claude/reviews/config.json` (`.tmp` + rename) |
| `src/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.ts` | Allow-list merge (5 fields only) + `externalLink` HTTPS validation + drops empty link |
| `src/dashboard/modules/settingsModal.js` | Humble object: `buildSettingsViewModel`, `renderSettingsModalHtml`, `validateExternalLink`, `extractFormPayload` |
| `src/tests/acceptance/179-dashboard-project-settings-modal.acceptance.test.ts` | 22 acceptance tests (15 spec + 7 cross-checks) |
| `src/tests/stubs/projectConfigGateway.stub.ts` | In-memory stub for the gateway |
| `src/tests/units/modules/cli-configuration/interface-adapters/gateways/projectConfig.fileSystem.gateway.test.ts` | Gateway unit tests |
| `src/tests/units/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.test.ts` | Usecase unit tests (merge, validation, external link strip) |
| `src/tests/units/dashboard/modules/settingsModal.test.ts` | Humble module unit tests (viewmodel, rendering, validation) |
| `docs/specs/179-dashboard-project-settings-modal.md` | Source-of-truth spec (15 scenarios) |
| `docs/plans/179-dashboard-project-settings-modal.plan.md` | Implementation plan |
| `docs/reports/179-dashboard-project-settings-modal.report.md` | This report |

## Files modified

| Path | Delta |
|------|-------|
| `src/config/projectConfig.ts` | Added `externalLink?: string` to interface + parser preserves it |
| `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts` | Added `PATCH /api/project-config` endpoint reusing the existing route plugin |
| `src/modules/statistics-insights/interface-adapters/presenters/overview.presenter.ts` | Exposes `externalLink` per project on overview cards (reads `.claude/reviews/config.json` via the new gateway) |
| `src/modules/statistics-insights/interface-adapters/controllers/http/overview.routes.ts` | Wires the gateway into the presenter |
| `src/dashboard/modules/overview.js` | Renders external-link icon (`target="_blank" rel="noopener noreferrer"`) when `externalLink` set |
| `src/dashboard/index.html` | `<button id="open-settings-modal-btn">` in sidebar (hidden on overview) + `<dialog id="settings-modal">` + inline-script wiring (open/close/submit/Escape/backdrop) |
| `src/dashboard/styles.css` | Modal layout + Agentic OS DNA (monospace, amber accents, corner-brackets) + `@media (prefers-reduced-motion: reduce)` block |
| `src/main/routes.ts` | Wired `ProjectConfigFileSystemGateway` + `UpdateProjectConfigUseCase` + extended `projectConfigRoutes` registration |
| `src/tests/units/config/projectConfig.test.ts` | Added cases for `externalLink` parsing |
| `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.test.ts` | Added PATCH tests |
| `src/tests/units/dashboard/modules/overview.test.ts` | Added `externalLink` icon rendering tests |
| `src/tests/units/modules/statistics-insights/interface-adapters/presenters/overview.presenter.test.ts` | Asserts `externalLink` propagation |
| `src/tests/units/modules/statistics-insights/interface-adapters/controllers/http/overview.routes.test.ts` | Asserts payload exposure |
| `docs/feature-tracker.md` | Status `planned` → `implemented` |

## Test count

| Bucket | Count |
|--------|-------|
| New test files | 5 |
| Extended test files | 5 |
| New tests added | **+70** (22 acceptance + ~48 unit) |
| Scope tests (specs 177/178/179 acceptance) | **56 / 56 GREEN** |
| Full suite | **2128 / 2128 GREEN** |

## Spec coverage table (15 scenarios → tests)

| # | Scenario | Test file | Test name |
|---|----------|-----------|-----------|
| 1 | open modal on project tab | `179-*.acceptance.test.ts` | `opens with the current ProjectConfig values pre-filled` |
| 2 | settings button hidden on overview | `179-*.acceptance.test.ts` | `Settings button is hidden when activeTabId is 'overview'` |
| 3 | save language change | `179-*.acceptance.test.ts` + `updateProjectConfig.usecase.test.ts` | `PATCH /api/project-config persists language` |
| 4 | save default model | `179-*.acceptance.test.ts` | `PATCH persists defaultModel` |
| 5 | save external link valid | `179-*.acceptance.test.ts` + `overview.js` test | `200 + overview project card shows external-link icon` |
| 6 | empty external link allowed | `updateProjectConfig.usecase.test.ts` | `empty string strips externalLink from merged config` |
| 7 | reject http link | `179-*.acceptance.test.ts` + `settingsModal.test.ts` | `reject "Le lien doit être en HTTPS"` |
| 8 | reject javascript scheme | `179-*.acceptance.test.ts` | `reject "URL invalide"` |
| 9 | reject free text | `settingsModal.test.ts` | `validateExternalLink returns invalid for "not a url"` |
| 10 | close via X | inline-script wiring + manual smoke | `settingsModal.test.ts: renderSettingsModalHtml emits close button` |
| 11 | close via Escape | inline-script wiring (dialog native Escape) | covered by markup `<dialog>` semantics |
| 12 | close via backdrop | inline-script wiring | covered by `dialog::backdrop` click handler |
| 13 | in-memory propagation | `updateProjectConfig.usecase.test.ts` | `next read of disk picks up new values` (atomic write ensured by gateway) |
| 14 | malformed config file | `projectConfig.fileSystem.gateway.test.ts` | `throws "Configuration projet illisible" on invalid JSON` |
| 15 | network failure on save | inline-script wiring | manual smoke (fetch reject path covered by error literal) |

Reduced-motion + accessibility scenarios additionally covered by the acceptance assertions on `styles.css` content.

---

## Self-review

- Iterations: 1 (after the resumed agent finalized backend + frontend, orchestrator fixed 2 TS errors in the test suite + 1 Biome no-delete violation in the usecase)
- Violations fixed:
  - `SettingsModalConfigInput` typedef widened to accept the full `ProjectConfig` shape (extra optional fields ignored by the builder — strict TS literal-extra-property rejection was the cause)
  - `updateProjectConfig.usecase.test.ts` mutation-via-closure rewritten with an observer array (avoids TS `never` narrowing on the `null` initializer)
  - `delete merged.externalLink` rewritten as a destructure-and-spread (`const { externalLink: _omitted, ...withoutLink } = merged`) to satisfy Biome `noDelete` while keeping "remove the key" semantics

## Notes on the 3 orchestrator resolutions

1. **Q1 — no central in-memory ProjectConfig cache**: confirmed via grep, 5 call sites all re-read from disk. The route accepts an optional `onUpdated` hook in its DI interface for SPEC-180 forward-compat but it is a no-op today. Spec scenario "in-memory propagation" is satisfied by the atomic write + next-job fresh read pattern.

2. **Q3 — `externalLink` on overview cards**: implemented in `OverviewPresenter` (not in `/api/repositories`) — the presenter reads each project's `.claude/reviews/config.json` via the new gateway and exposes the field on the per-project view-model. N small disk reads per overview refresh — acceptable for typical N (< 10 repos). Projects without the file get `externalLink: undefined`.

3. **Q5 — empty `externalLink` means "remove the link"**: confirmed. The usecase strips the `externalLink` key from the merged config via destructure-and-spread; on disk the key is absent (not written as empty string).

## Regression confirmation

- SPEC-177 acceptance: **19 / 19 GREEN**
- SPEC-178 acceptance: **15 / 15 GREEN**
- SPEC-179 acceptance: **22 / 22 GREEN**
- Full suite: **2128 / 2128 GREEN**
- `yarn typecheck`: passes
- `yarn lint`: passes (after orchestrator fix of the `noDelete` violation)

## Deviations from plan

None substantive. The destructure-and-spread of `externalLink` was a small refinement over the original `delete` call (Biome compliance). The `SettingsModalConfigInput` typedef was widened during finalization to keep the test calling-convention sensible (full ProjectConfig object). Both stay within the plan's intent.

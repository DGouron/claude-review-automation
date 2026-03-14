---
title: "SPEC-079: Remove old text-based progress tracking system"
status: draft
issue: "#79"
labels: refactor, P2-important, mcp
milestone: "Bug Fixes & Parity"
---

# SPEC-079: Remove old text-based progress tracking system

## User Story

As a maintainer of ReviewFlow,
I want to remove the legacy text-marker progress tracking code that has been superseded by the MCP-based system,
so that the codebase has a single, clear path for progress tracking and action communication -- reducing maintenance burden, eliminating dead code, and preventing confusion about which system is active.

## Context

### Problem

ReviewFlow currently contains **three overlapping systems** for tracking review progress and communicating actions between Claude and the host process:

| Generation | Mechanism | Status |
|------------|-----------|--------|
| **Gen 1: Text markers (stdout)** | `ProgressParser` parses `[PROGRESS:agent:status]` and `[PHASE:phase]` markers from Claude's stdout. `parseThreadActions()` parses `[THREAD_RESOLVE:id]`, `[THREAD_REPLY:id:msg]`, `[POST_COMMENT:body]` markers from stdout. | **Dead code** -- the MCP system prompt explicitly forbids text markers: _"Do NOT use text markers"_, _"Using text markers like [PROGRESS:xxx] -> Dashboard won't update"_. |
| **Gen 2: Context file (JSON)** | `ReviewContextFileSystemGateway` creates a JSON context file. Claude writes actions to it via the `Write` tool. `agentInstructionsBuilder` tells Claude how to update the file. `executeActionsFromContext()` reads and executes the actions after Claude finishes. | **Still active** -- used as the primary action execution path in gitlab.controller.ts and github.controller.ts. The MCP `add_action` tool also writes to this context file. |
| **Gen 3: MCP tools** | MCP server exposes `set_phase`, `start_agent`, `complete_agent`, `get_threads`, `add_action`. Claude calls these tools. `add_action` writes to the review context file (converging with Gen 2). Progress is tracked via the MCP `progressGateway` (in-memory). | **Active and authoritative** -- the system prompt mandates MCP tool usage. |

The issue specifically targets **Gen 1: text-marker parsing**. The `ProgressParser` class and `parseThreadActions()` function parse stdout for structured markers that Claude was instructed to emit. Now that the MCP system is in place, Claude uses MCP tools instead -- the text markers are never emitted. The parsing code is dead.

However, `ProgressParser` also serves a secondary role: it provides `markAllCompleted()` and `markFailed()` methods that `claudeInvoker.ts` calls to finalize progress state when the child process exits. This finalization logic is **not text-marker-dependent** -- it operates on the `ReviewProgress` data structure and could live elsewhere.

### What is dead (safe to remove)

1. **`src/frameworks/claude/progressParser.ts`** -- The `ProgressParser` class (text-marker parsing via regex), the `parseProgressMarkers()` utility function, and the `ParseResult` / `ProgressCallback` types.
2. **`src/claude/progressParser.ts`** -- Strangler Fig re-export shim.
3. **`src/tests/units/claude/progressParser.test.ts`** -- All tests for `ProgressParser`.
4. **`src/services/threadActionsParser.ts`** -- The `parseThreadActions()` function that parses `[THREAD_RESOLVE:...]`, `[THREAD_REPLY:...]`, `[POST_COMMENT:...]`, `[FETCH_THREADS]` markers from stdout.
5. **`src/tests/units/services/threadActionsParser.test.ts`** -- All tests for `parseThreadActions`.
6. **All "fallback" call sites** in controllers that call `parseThreadActions()` as a backup when MCP context actions are empty.

### What must be preserved (not dead)

1. **`ReviewProgress`, `AgentProgress`, `ProgressEvent` types** (`src/entities/progress/progress.type.ts`) -- used by the MCP progress gateway and the queue adapter.
2. **`createInitialProgress()`, `calculateOverallProgress()`** -- used by MCP server and (currently) by `ProgressParser`. After removal, only MCP uses them.
3. **`AgentDefinition` and defaults** -- used by MCP server, project config, and controllers.
4. **Progress finalization logic** (`markAllCompleted`, `markFailed`) -- `claudeInvoker.ts` needs this behavior. It must be relocated, not deleted.
5. **`ReviewContextFileSystemGateway`** and context file system -- actively used by MCP `add_action` and by controllers.
6. **`contextActionsExecutor.ts` / `executeActionsFromContext()`** -- this is the Gen 2 execution path, still active.
7. **`threadActionsExecutor.ts` / `executeThreadActions()`** -- also used in controller fallback paths. Since the fallback paths themselves are being removed, this function and its file become dead code too, **unless** something else uses `executeThreadActions` directly. (Verified: only the fallback paths use it -- safe to remove.)
8. **`parseReviewOutput()` in `statsService.ts`** -- parses score/blocking/warning counts from stdout using summary format and `[REVIEW_STATS:...]` markers. This is **NOT** part of the progress tracking system; it's stats extraction. It stays.

### Challenge: is anything still using the old text-marker system?

**No.** The MCP system prompt in `claudeInvoker.ts` explicitly instructs Claude:
- _"You MUST use these MCP tools for ALL operations. Do NOT use text markers."_
- _"Using text markers like [PROGRESS:xxx] -> Dashboard won't update"_

Claude never emits `[PROGRESS:...]` or `[THREAD_RESOLVE:...]` markers. The parsing code runs on every stdout chunk but never matches anything -- it is pure dead code. The "fallback" paths in controllers (`markerActions` / `parseThreadActions` as fallback when `mcpActions.length === 0`) are defensive code that never activates in practice.

The `ProgressParser` in `claudeInvoker.ts` is instantiated for every review, but its `parseChunk()` method never finds markers. Only `markAllCompleted()` and `markFailed()` are operationally used -- and these methods do not parse text markers.

## Gherkin Scenarios

### Feature: Removal of text-marker progress parsing

```gherkin
Feature: Remove text-marker progress tracking without breaking MCP-based tracking

  Background:
    Given the MCP-based progress system is the authoritative tracking mechanism
    And the system prompt instructs Claude to use MCP tools only

  Scenario: ProgressParser class and re-export shim are removed
    When the codebase is searched for "ProgressParser"
    Then no results are found in production code
    And no results are found in test code
    And the file "src/frameworks/claude/progressParser.ts" does not exist
    And the file "src/claude/progressParser.ts" does not exist
    And the file "src/tests/units/claude/progressParser.test.ts" does not exist

  Scenario: threadActionsParser is removed
    When the codebase is searched for "parseThreadActions"
    Then no results are found in production code
    And no results are found in test code
    And the file "src/services/threadActionsParser.ts" does not exist
    And the file "src/tests/units/services/threadActionsParser.test.ts" does not exist

  Scenario: threadActionsExecutor is removed
    When the codebase is searched for "executeThreadActions"
    Then no results are found in production code
    And no results are found in test code
    And the file "src/services/threadActionsExecutor.ts" does not exist
    And the file "src/tests/units/services/threadActionsExecutor.test.ts" does not exist

  Scenario: Controller fallback paths for stdout markers are removed
    Given "gitlab.controller.ts" handles a successful followup review
    When the followup result is processed
    Then actions are read exclusively from the review context file (MCP path)
    And there is no fallback to parsing stdout for text markers
    And the comment "FALLBACK: Execute thread actions from stdout markers" does not appear

  Scenario: Controller fallback paths for stdout markers are removed (GitHub)
    Given "github.controller.ts" handles a successful review
    When the review result is processed
    Then actions are read exclusively from the review context file (MCP path)
    And there is no fallback to parsing stdout for text markers

  Scenario: mrTrackingAdvanced fallback path is removed
    Given "mrTrackingAdvanced.routes.ts" handles a successful followup
    When the followup result is processed
    Then actions are read exclusively from the review context file (MCP path)
    And the variable "markerActions" does not exist
    And there is no "legacy fallback" comment

  Scenario: Progress finalization still works after ProgressParser removal
    Given a review job is running via claudeInvoker
    When the Claude child process exits with code 0
    Then all pending agents are marked as completed
    And the phase is set to "completed"
    And the overall progress is 100
    And the final progress is returned in the InvocationResult

  Scenario: Progress finalization on failure still works
    Given a review job is running via claudeInvoker
    When the Claude child process exits with a non-zero code
    Then running agents are marked as failed with the exit code
    And the final progress is returned in the InvocationResult

  Scenario: Progress finalization on memory exceeded still works
    Given a review job is running via claudeInvoker
    When the memory guard kills the child process
    Then running agents are marked as failed with "Memory limit exceeded"
    And the final progress is returned in the InvocationResult

  Scenario: Progress finalization on cancellation still works
    Given a review job is running via claudeInvoker
    When the user cancels the review via AbortSignal
    Then running agents are marked as failed with cancellation message
    And the final progress is returned in the InvocationResult

  Scenario: MCP progress system continues to work end-to-end
    Given a review job is enqueued
    When Claude invokes set_phase with phase "agents-running"
    And Claude invokes start_agent with agentName "security"
    And Claude invokes complete_agent with agentName "security" and status "success"
    And Claude invokes set_phase with phase "completed"
    Then the MCP progress gateway reflects the correct state
    And the dashboard receives progress updates via WebSocket

  Scenario: Review stats parsing is unaffected
    Given a review completes with stdout containing "[REVIEW_STATS:blocking=2:warnings=3:suggestions=1:score=7.5]"
    When parseReviewOutput is called
    Then it returns score 7.5, blocking 2, warnings 3, suggestions 1
    And the stats service is unmodified

  Scenario: No references to old progress markers remain
    When the codebase is searched for "PROGRESS_PATTERN" or "PHASE_PATTERN"
    Then no results are found
    When the codebase is searched for "[PROGRESS:" as a regex pattern
    Then no results are found in production code (system prompt warning text is acceptable)
    When the codebase is searched for "stdout markers" in comments
    Then no results are found
```

## Out of Scope

- **Removing the context file system (Gen 2)**: The `ReviewContextFileSystemGateway`, `agentInstructionsBuilder`, and `executeActionsFromContext` are still actively used by the MCP `add_action` handler and controllers. They stay.
- **Removing `parseReviewOutput()` / `[REVIEW_STATS:...]` parsing**: This is stats extraction, not progress tracking. It serves a different purpose and remains functional.
- **Removing the MCP system prompt warnings about text markers**: After removal, the warnings become obsolete. However, removing them is cosmetic and can be done in a follow-up. If addressed here, it should be a single-line change, not a scope expansion.
- **Refactoring `contextActionsExecutor.ts` or `threadActionsExecutor.ts` deprecation markers**: These files have `@deprecated` annotations. Full replacement with direct gateway calls is a separate refactoring ticket.
- **Removing the `src/claude/invoker.ts` Strangler Fig shim**: This re-exports `invokeClaudeReview` and `sendNotification` from `frameworks/claude/claudeInvoker.ts`. It is unrelated to progress tracking. If it has no remaining consumers, it could be removed, but that's a separate cleanup.
- **Modifying the MCP server or MCP handlers**: The MCP system is working correctly. No changes needed.
- **Dashboard changes**: The dashboard consumes progress via WebSocket events from the queue adapter. No dashboard code changes are needed.

## INVEST Validation

| Criterion | Pass | Rationale |
|-----------|------|-----------|
| **Independent** | Yes | Only removes dead code and relocates finalization logic. No dependency on other tickets. No new features. |
| **Negotiable** | Yes | The `threadActionsParser` / `threadActionsExecutor` removal could be split into a separate ticket if desired. The progress finalization could use different approaches (standalone functions vs. a thin wrapper class). |
| **Valuable** | Yes | Eliminates ~500 lines of dead code across 6+ files. Removes a confusing dual-system that makes onboarding and debugging harder. Removes fallback paths that mask MCP failures silently. |
| **Estimable** | Yes | ~2-3 hours. Mostly file deletion and removing fallback branches in controllers. The only non-trivial work is relocating `markAllCompleted` / `markFailed` logic out of `ProgressParser`. |
| **Small** | Yes | 1-2 story points. 6 files deleted, 4-5 files modified (removing imports and fallback branches). No new abstractions. |
| **Testable** | Yes | All scenarios are verifiable: file existence checks, grep for removed patterns, existing MCP tests continue to pass, progress finalization tests are relocated. `yarn verify` is the gate. |

## Definition of Done

### File deletions

- [ ] Delete `src/frameworks/claude/progressParser.ts` (ProgressParser class + parseProgressMarkers utility)
- [ ] Delete `src/claude/progressParser.ts` (Strangler Fig re-export shim)
- [ ] Delete `src/tests/units/claude/progressParser.test.ts` (all ProgressParser tests)
- [ ] Delete `src/services/threadActionsParser.ts` (parseThreadActions function)
- [ ] Delete `src/tests/units/services/threadActionsParser.test.ts` (all parseThreadActions tests)
- [ ] Delete `src/services/threadActionsExecutor.ts` (executeThreadActions function + defaultCommandExecutor)
- [ ] Delete `src/tests/units/services/threadActionsExecutor.test.ts` (all executeThreadActions tests)

### Code modifications

- [ ] **`src/frameworks/claude/claudeInvoker.ts`**: Remove `ProgressParser` import. Relocate `markAllCompleted` / `markFailed` / `getProgress` logic to a lightweight alternative (e.g., standalone functions operating on `ReviewProgress`, or inline the logic). Remove `parseChunk()` call from the stdout handler. Keep progress callback (`onProgress`) working.
- [ ] **`src/interface-adapters/controllers/webhook/gitlab.controller.ts`**: Remove `parseThreadActions` import. Remove both fallback paths (~lines 333-352 and ~lines 569-587) that parse stdout for markers. Keep the primary `executeActionsFromContext()` path.
- [ ] **`src/interface-adapters/controllers/webhook/github.controller.ts`**: Remove `parseThreadActions` import. Remove the fallback path (~lines 280-298) that parses stdout for markers. Keep the `executeActionsFromContext()` path.
- [ ] **`src/interface-adapters/controllers/http/mrTrackingAdvanced.routes.ts`**: Remove `parseThreadActions` import. Remove the `markerActions` variable and the "legacy fallback" logic (~lines 175-181). Use `mcpActions` directly (or context actions).
- [ ] **`src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts`**: Update any test expectations that reference stdout markers or the fallback path.
- [ ] **`src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts`**: Update any test expectations that reference stdout markers or the fallback path.

### Relocated logic

- [ ] Progress finalization (`markAllCompleted`, `markFailed`, initial progress creation) is available to `claudeInvoker.ts` without `ProgressParser`. Options:
  - (A) Standalone functions in a new file (e.g., `src/entities/progress/progress.finalizer.ts`) -- preferred, keeps domain logic in entities layer
  - (B) Inline the logic directly in `claudeInvoker.ts` -- simpler but puts domain logic in frameworks layer
  - (C) Keep a stripped-down `ProgressTracker` class without any text parsing -- viable but borderline over-engineering for 3 methods
- [ ] Tests for the relocated finalization logic exist and pass

### Verification

- [ ] `yarn verify` passes (typecheck + lint + test:ci)
- [ ] No TypeScript compilation errors
- [ ] Grep for `ProgressParser` returns zero results in `src/`
- [ ] Grep for `parseThreadActions` returns zero results in `src/`
- [ ] Grep for `executeThreadActions` returns zero results in `src/`
- [ ] Grep for `PROGRESS_PATTERN` returns zero results
- [ ] Grep for `parseProgressMarkers` returns zero results
- [ ] Grep for `threadActionsParser` returns zero results in imports
- [ ] Existing MCP-related tests continue to pass unchanged
- [ ] Dashboard progress tracking works end-to-end (manual verification)

### Quality

- [ ] No new dependencies added
- [ ] No `as Type` assertions introduced
- [ ] Imports use `@/` alias with `.js` extension
- [ ] Naming follows codebase conventions
- [ ] All tests in English

## Technical Notes

### Files to delete (7 files, ~550 lines)

| File | Lines | Content |
|------|-------|---------|
| `src/frameworks/claude/progressParser.ts` | 245 | ProgressParser class, parseProgressMarkers utility |
| `src/claude/progressParser.ts` | 11 | Strangler Fig re-export shim |
| `src/tests/units/claude/progressParser.test.ts` | 267 | ProgressParser tests |
| `src/services/threadActionsParser.ts` | 74 | parseThreadActions function |
| `src/tests/units/services/threadActionsParser.test.ts` | ~190 | parseThreadActions tests |
| `src/services/threadActionsExecutor.ts` | 66 | executeThreadActions function, defaultCommandExecutor |
| `src/tests/units/services/threadActionsExecutor.test.ts` | ~100 | executeThreadActions tests |

### Files to modify (4-6 files)

| File | Change |
|------|--------|
| `src/frameworks/claude/claudeInvoker.ts` | Remove ProgressParser, relocate finalization logic |
| `src/interface-adapters/controllers/webhook/gitlab.controller.ts` | Remove 2 fallback paths |
| `src/interface-adapters/controllers/webhook/github.controller.ts` | Remove 1 fallback path |
| `src/interface-adapters/controllers/http/mrTrackingAdvanced.routes.ts` | Remove marker fallback |
| `src/tests/units/.../gitlab.controller.test.ts` | Update if referencing markers |
| `src/tests/units/.../github.controller.test.ts` | Update if referencing markers |

### Dependency chain for `defaultCommandExecutor`

`threadActionsExecutor.ts` exports `defaultCommandExecutor`, which is imported by:
- `gitlab.controller.ts` (for the fallback path being removed)
- `mrTrackingAdvanced.routes.ts` (for the fallback path being removed)
- `github.controller.ts` (for the fallback path being removed)

After removing the fallback paths, `defaultCommandExecutor` is no longer imported from `threadActionsExecutor.ts`. However, `contextActionsExecutor.ts` also exports a `CommandExecutor` type and is used by the primary paths. Verify that `defaultCommandExecutor` is not needed elsewhere -- if the primary paths already use their own executor or `contextActionsExecutor`'s `defaultCommandExecutor`, the removal is clean.

**Verified**: `defaultCommandExecutor` from `threadActionsExecutor.ts` is imported only in controller fallback paths. The primary paths use `defaultCommandExecutor` from the same file for `executeThreadActions` calls, and `contextActionsExecutor.ts` is used for `executeActionsFromContext` calls. Both executor files delegate to the same CLI gateways. After removing fallback paths, `threadActionsExecutor.ts` has no consumers.

### Progress finalization relocation

The recommended approach is option (A): create `src/entities/progress/progress.finalizer.ts` with:

```typescript
export function markAllAgentsCompleted(progress: ReviewProgress): ReviewProgress
export function markRunningAgentsFailed(progress: ReviewProgress, error: string): ReviewProgress
```

These are pure functions that return a new `ReviewProgress` object. `claudeInvoker.ts` replaces `progressParser.markAllCompleted()` with `progress = markAllAgentsCompleted(progress)` and similarly for `markFailed`. This keeps domain logic in the entities layer and follows the existing pattern of `createInitialProgress()` and `calculateOverallProgress()`.

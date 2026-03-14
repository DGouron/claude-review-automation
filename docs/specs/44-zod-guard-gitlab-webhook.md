# Spec #44 — Zod Guard for GitLab Webhook Payload

## Status: PARTIALLY IMPLEMENTED

> **Important finding**: The guard and controller integration already exist in production code. What remains is **controller-level test coverage** for the invalid payload path (400 response). See [Current State](#current-state) for details.

---

## Problem Statement

An unsafe `request.body as GitLabMergeRequestEvent` type assertion in the GitLab controller bypassed runtime validation, meaning malformed webhook payloads could crash the server or produce undefined behavior. The GitHub controller was fixed in PR #2 using a Zod guard pattern.

## Current State

| Artifact | Status | Evidence |
|----------|--------|----------|
| Zod schema (`gitlabMergeRequestEvent.guard.ts`) | Done | Full schema with `object_kind`, `project`, `object_attributes`, `reviewers`, `assignees`, `changes` |
| Type inferred from schema (`GitLabMergeRequestEvent`) | Done | `z.infer<typeof gitLabMergeRequestEventSchema>` at line 59 |
| Controller uses `safeParse` instead of `as` | Done | `gitlab.controller.ts` line 88-94 |
| Controller returns 400 on invalid payload | Done | `gitlab.controller.ts` line 91 |
| Guard unit tests (valid/invalid payloads) | Done | 7 tests in `gitlabMergeRequestEvent.guard.test.ts` |
| Controller test for 400 on invalid payload | **MISSING** | No test in `gitlab.controller.test.ts` |
| Controller test for 401 on signature failure | **MISSING** | No test in `gitlab.controller.test.ts` |
| Controller test for ignored non-MR events | **MISSING** | No test in `gitlab.controller.test.ts` |

## User Story

**As a** ReviewFlow operator,
**I want** the GitLab webhook endpoint to reject malformed payloads with a clear 400 error,
**so that** invalid requests are caught at the boundary before reaching business logic, and I can diagnose integration issues from the error response.

## Remaining Scope

The only remaining work is adding controller-level integration tests that verify the guard is correctly wired into the request handling pipeline.

---

## Gherkin Scenarios

### Feature: GitLab webhook payload validation

#### Scenario 1: Valid MR event with reviewer assignment (nominal)

```gherkin
Given a GitLab webhook request with valid signature
  And the event type header is "Merge Request Hook"
  And the payload contains a valid merge request event with reviewer "claude-bot" added
When the webhook handler processes the request
Then the response status should be 202
  And the response body should contain "queued" status
  And the review job should be enqueued
```

#### Scenario 2: Invalid payload — missing required fields

```gherkin
Given a GitLab webhook request with valid signature
  And the event type header is "Merge Request Hook"
  And the payload is missing the "object_attributes" field
When the webhook handler processes the request
Then the response status should be 400
  And the response body should contain error "Invalid webhook payload"
  And no review job should be enqueued
```

#### Scenario 3: Invalid payload — wrong object_kind

```gherkin
Given a GitLab webhook request with valid signature
  And the event type header is "Merge Request Hook"
  And the payload has object_kind "push" instead of "merge_request"
When the webhook handler processes the request
Then the response status should be 400
  And the response body should contain error "Invalid webhook payload"
```

#### Scenario 4: Invalid payload — empty object

```gherkin
Given a GitLab webhook request with valid signature
  And the event type header is "Merge Request Hook"
  And the payload is an empty object {}
When the webhook handler processes the request
Then the response status should be 400
  And the response body should contain error "Invalid webhook payload"
```

#### Scenario 5: Invalid payload — null body

```gherkin
Given a GitLab webhook request with valid signature
  And the event type header is "Merge Request Hook"
  And the request body is null
When the webhook handler processes the request
Then the response status should be 400
  And the response body should contain error "Invalid webhook payload"
```

#### Scenario 6: Invalid payload — invalid state enum value

```gherkin
Given a GitLab webhook request with valid signature
  And the event type header is "Merge Request Hook"
  And the payload has object_attributes.state set to "invalid_state"
When the webhook handler processes the request
Then the response status should be 400
  And the response body should contain error "Invalid webhook payload"
```

#### Scenario 7: Invalid payload — wrong types for numeric fields

```gherkin
Given a GitLab webhook request with valid signature
  And the event type header is "Merge Request Hook"
  And the payload has object_attributes.iid as a string "42" instead of number 42
When the webhook handler processes the request
Then the response status should be 400
  And the response body should contain error "Invalid webhook payload"
```

#### Scenario 8: Valid payload with extra fields (passthrough)

```gherkin
Given a GitLab webhook request with valid signature
  And the event type header is "Merge Request Hook"
  And the payload contains all required fields plus extra unknown fields
When the webhook handler processes the request
Then the response status should NOT be 400
  And the extra fields should be stripped by Zod (default behavior)
  And the handler should proceed to event filtering
```

#### Scenario 9: Signature verification failure (pre-validation)

```gherkin
Given a GitLab webhook request with an invalid signature
When the webhook handler processes the request
Then the response status should be 401
  And payload validation should NOT be attempted
```

#### Scenario 10: Non-MR event type (pre-validation)

```gherkin
Given a GitLab webhook request with valid signature
  And the event type header is "Push Hook"
When the webhook handler processes the request
Then the response status should be 200
  And the response body should indicate the event was ignored
  And payload validation should NOT be attempted
```

#### Scenario 11: Valid payload with optional fields absent

```gherkin
Given a GitLab webhook request with valid signature
  And the event type header is "Merge Request Hook"
  And the payload has no "reviewers", "assignees", "changes", or "description" fields
When the webhook handler processes the request
Then the response status should NOT be 400
  And the handler should proceed normally with optional fields as undefined
```

---

## Out of Scope

- **Modifying the Zod schema itself** — the schema is already correct and matches GitLab's webhook structure.
- **Modifying the controller logic** — the `safeParse` + 400 pattern is already in place.
- **Modifying the guard unit tests** — they already cover valid, invalid, missing fields, wrong enum, and assignees scenarios.
- **Adding similar tests to the GitHub controller** — that is a separate ticket (same gap exists there).
- **Schema evolution for new GitLab webhook fields** — track separately as fields are needed.
- **Custom error messages with field-level details** — the current generic "Invalid webhook payload" is sufficient; detailed Zod errors are logged server-side.

---

## INVEST Validation

| Criterion | Assessment | Pass? |
|-----------|-----------|-------|
| **Independent** | No dependency on other tickets. Tests can be added without changing production code. | Yes |
| **Negotiable** | The number of test scenarios can be adjusted (minimal: scenarios 2, 4, 5; thorough: all). | Yes |
| **Valuable** | Closes a test coverage gap on a P1-critical webhook boundary. Prevents regressions if someone accidentally removes the guard. | Yes |
| **Estimable** | XS effort — add 3-6 test cases to an existing test file following the established pattern. | Yes |
| **Small** | Single test file modification. No production code changes. < 2 hours. | Yes |
| **Testable** | Each scenario has a concrete Given/When/Then with observable HTTP status and response body. | Yes |

---

## Definition of Done

- [ ] Controller test file (`gitlab.controller.test.ts`) includes a test for 400 response on invalid payload (empty object)
- [ ] Controller test file includes a test for 400 response on payload with missing required fields
- [ ] Controller test file includes a test for 400 response on null/undefined body
- [ ] Controller test file includes a test for 400 response on wrong `object_kind`
- [ ] Controller test file includes a test for 400 response on invalid `state` enum
- [ ] Controller test verifies that no review job is enqueued on invalid payload
- [ ] All tests use `GitLabEventFactory` (no hardcoded payloads except for deliberately malformed ones)
- [ ] All tests are written in English
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] No production code was modified (tests only)

---

## Technical Notes

### Files to Modify

| File | Action |
|------|--------|
| `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts` | Add `describe('when payload is invalid')` block with 4-6 test cases |

### Files to Read (Reference)

| File | Why |
|------|-----|
| `src/entities/gitlab/gitlabMergeRequestEvent.guard.ts` | Current Zod schema (already complete) |
| `src/interface-adapters/controllers/webhook/gitlab.controller.ts` lines 88-94 | Guard integration point (already done) |
| `src/tests/units/entities/gitlab/gitlabMergeRequestEvent.guard.test.ts` | Existing guard-level tests (reference) |
| `src/tests/factories/gitLabEvent.factory.ts` | Factory for valid payloads |

### Test Pattern

The controller test uses `vi.mock` for external dependencies (verifier, queue, invoker). The guard validation tests should:

1. Keep signature verification mocked as valid (default mock)
2. Keep event type mocked as `"Merge Request Hook"` (default mock)
3. Send malformed payloads through `request.body`
4. Assert `reply.status(400)` and `reply.send({ error: 'Invalid webhook payload' })`
5. Assert `enqueueReview` was NOT called

For scenarios 9 and 10, override the mocks for `verifyGitLabSignature` and `getGitLabEventType` respectively.

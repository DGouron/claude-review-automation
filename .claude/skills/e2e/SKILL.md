---
name: e2e
description: Guide for Playwright end-to-end tests. Use to create a new e2e test, debug a flaky test, or test API endpoints. Covers patterns, workarounds, and project conventions.
---

# Playwright E2E Testing Guide

## Persona

Read `.claude/roles/code-reviewer.md` — adopt this profile and follow all its rules.

## Activation

This skill activates for:
- Creating a new e2e test
- Debugging a flaky test
- Testing a critical feature (complete API workflow)

---

## Architecture

```
src/tests/e2e/
├── fixtures/
│   └── test-data.ts          # Test data (webhooks, payloads, etc.)
├── specs/
│   ├── setup.ts              # Server setup (run once)
│   └── <context>/
│       └── <feature>.spec.ts # Tests per feature
└── utils/
    └── test-helpers.ts       # Helpers (API calls, server setup)
```

---

## Commands

| Command | Usage |
|---------|-------|
| `yarn e2e` | Run all tests |
| `yarn e2e:debug` | Debug mode with inspector |
| `yarn test:e2e:report` | View HTML report |

---

## Workflow: Create a New Test

### 1. Identify the Context

```
specs/
├── setup.ts                # Setup (do not touch)
├── webhook/                # Webhook endpoint tests
├── review/                 # Review workflow tests
└── health/                 # Health check tests
```

### 2. Write the Test

```typescript
// specs/webhook/github-webhook.spec.ts
import { test, expect } from "@playwright/test";

test.describe("GitHub Webhook", () => {
  test("should accept a valid pull request event", async ({ request }) => {
    const response = await request.post("/webhooks/github", {
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-hub-signature-256": "sha256=valid-signature",
      },
      data: {
        action: "opened",
        pull_request: {
          number: 42,
          title: "feat: add new feature",
          head: { ref: "feat/new-feature" },
          base: { ref: "main" },
        },
        repository: { full_name: "org/repo" },
        sender: { login: "developer" },
      },
    });

    expect(response.status()).toBe(200);
  });

  test("should reject an invalid payload", async ({ request }) => {
    const response = await request.post("/webhooks/github", {
      data: {},
    });

    expect(response.status()).toBe(400);
  });
});
```

### 3. Run and Validate

```bash
# Debug mode
yarn e2e:debug

# Run a single file
yarn e2e specs/webhook/github-webhook.spec.ts
```

---

## Selectors (priority for UI tests)

| Priority | Type | Example |
|----------|------|---------|
| 1 | `data-testid` | `[data-testid="submit-btn"]` |
| 2 | Role (accessibility) | `getByRole("button", { name: "Submit" })` |
| 3 | Text | `getByText("Submit")` |
| 4 | CSS (last resort) | `table tbody tr` |

---

## Authentication for API Tests

### Token-based Authentication

```typescript
test.describe("Authenticated API", () => {
  test("should return review status with valid token", async ({ request }) => {
    const response = await request.get("/api/reviews/123", {
      headers: {
        Authorization: `Bearer ${process.env.TEST_API_TOKEN}`,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("status");
  });
});
```

---

## Fixtures and Test Data

### Use existing fixtures

```typescript
import { TEST_WEBHOOKS, TEST_PAYLOADS } from "../fixtures/test-data";

test("should process a GitLab merge request event", async ({ request }) => {
  const response = await request.post("/webhooks/gitlab", {
    data: TEST_PAYLOADS.gitlabMergeRequest,
  });

  expect(response.status()).toBe(200);
});
```

### Add test data

```typescript
// fixtures/test-data.ts
export const TEST_PAYLOADS = {
  gitlabMergeRequest: {
    object_kind: "merge_request",
    object_attributes: {
      iid: 1,
      title: "feat: add review automation",
      action: "open",
    },
  },
  githubPullRequest: {
    action: "opened",
    pull_request: {
      number: 42,
      title: "fix: resolve webhook validation",
    },
  },
};
```

---

## Debugging Flaky Tests

### 1. Debug mode

```bash
yarn e2e:debug specs/webhook/my-test.spec.ts
```

### 2. Trace on failure

Traces are enabled on the first retry. After a failure:

```bash
yarn test:e2e:report
```

### 3. Logs

```typescript
// Add checkpoints
console.log("Step: Sending webhook payload");
```

### 4. Stabilization Patterns

```typescript
// Flaky: not waiting for server readiness
await request.post("/webhooks/github", { data: payload });

// Stable: verify server is ready first
const health = await request.get("/health");
expect(health.status()).toBe(200);
await request.post("/webhooks/github", { data: payload });
```

---

## New Test Checklist

- [ ] Test data uses fixtures (not hardcoded)
- [ ] Assertions use `expect()` from Playwright
- [ ] Test runs in isolation (no dependency on other tests)
- [ ] API responses are properly validated (status + body)
- [ ] Error cases are covered (invalid payloads, missing auth)

---

## Anti-patterns

| Avoid | Prefer |
|-------|--------|
| Hardcoded test data | Fixtures from `test-data.ts` |
| Tests dependent on each other | Isolated tests |
| Missing error case coverage | Test both success and failure paths |
| Ignoring response body | Validate status AND body structure |
| Arbitrary `waitForTimeout` | Proper readiness checks |

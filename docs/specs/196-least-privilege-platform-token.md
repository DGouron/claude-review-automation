---
title: "SPEC-196: Least-privilege platform token for the CLI executor"
status: draft
labels: [executor, gitlab, least-privilege, token-scoping]
visibility: PRIVATE-UNTIL-P0-SHIPPED
depends_on: [SPEC-198]
---

# SPEC-196: Least-privilege platform token for the CLI executor

## Context

The CLI executor (`glab`-backed) currently runs with the ambient admin token wired at `routes.ts:58` (`defaultGitLabExecutor`). That token is broad: it can read, write, resolve threads, reply, post comments, and revoke approvals across every project the admin can see. The executor's input is a worktree diff read at `gitlab.controller.ts:849-1031` that is **non-sanitizable** by construction, and the model emits thread/comment verbs parsed at `threadActionsParser.ts:13-66`.

This spec scopes the executor's GitLab credential to the **minimum privilege required by the actions that remain in the auto path**, builds its process environment by **allowlist** (not denylist), isolates `HOME`/`GLAB_CONFIG_DIR` so the token lives in an isolated `glab` config file rather than the process env, and **freezes the minimal role per action before merge**. The privilege boundary is enforced by construction, so the worst case of an auto-confirmed hostile diff (SPEC-174 chokepoint) is bounded to **read MR + postComment** — nothing else.

This is a sibling of SPEC-197/198/199/201. It does **not** fix actor authentication, target validation of write verbs, or provenance signing — those remain with the sibling specs. It bounds **impact**, not **trust**.

**Merge order (blocking):** SPEC-198 (`THREAD_RESOLVE` target-validation) MUST merge **before** SPEC-196. Closure of `THREAD_RESOLVE` is the **unwire in 196**, not the target-validation in 198 — if 196 lands first, the verb stays wired with only partial validation; if 198 lands without 196, the verb stays wired entirely. 198 hardens the verb while it still exists; 196 removes it. SPEC-196 therefore declares `depends_on: [SPEC-198]`.

## Current behavior

| Concern | Location | Behavior today |
|---|---|---|
| Executor token source | `routes.ts:58` | `defaultGitLabExecutor` uses the ambient admin token — full read/write/revoke. |
| Executor wiring | `gitlab.controller.ts:938-978` | Executors wired with the same broad credential for every action. |
| Job construction | `gitlab.controller.ts:716-766` | `ReviewJob` built 100% from the inbound payload. |
| Diff ingestion | `gitlab.controller.ts:849-1031` | Diff read from the worktree, **non-sanitizable**, fed to the model. |
| Thread/comment verbs | `threadActionsParser.ts:13-66` | Parses `[THREAD_RESOLVE:id]`, `[THREAD_REPLY]`, `[POST_COMMENT]`, `[FETCH_THREADS]`; `executeThreadActions` + `contextActionsExecutor` execute them. |
| Revoke | `approvalRevocationGateway.revoke` | Revokes approvals with the ambient token. |
| Post comment | `noteCommentPostGateway.postComment({projectPath, mrNumber, body})` | Posts with the ambient token. |
| Process env | (executor spawn) | Inherits the full parent environment (denylist-shaped, leaks unrelated secrets). |
| Config dir | (executor spawn) | Inherits the operator `HOME`/`GLAB_CONFIG_DIR`; token reachable from env. |

## Acceptance criteria

### AC1 — Dedicated service token, fail-closed
The executor uses a **dedicated GitLab service account token** (`REVIEWFLOW_EXECUTOR_TOKEN`), never the ambient admin token. If the token is absent or empty at executor construction, construction **throws and the job is not started** (fail-closed). No silent fallback to the admin token.
- **Test (deterministic):** construct the executor factory with the token env var unset → expect a thrown error and zero `glab`/gateway invocations. Construct with a non-empty token → expect a configured executor. Assert on the thrown error and the spawn-args, never on model output.

### AC2 — Environment built by allowlist
The executor process environment is assembled from an **explicit allowlist** of keys (`PATH`, `HOME`, `GLAB_CONFIG_DIR`, `LANG`, and any minimal runtime keys enumerated in code), not by copying `process.env` and deleting sensitive keys. Any key not in the allowlist is absent from the child env.
- **Test (deterministic):** seed the parent process env with a canary secret key (e.g. `AMBIENT_ADMIN_TOKEN=canary`). Build the child env. Assert the canary key is **absent** from the resulting env map and that the env map's keyset is a subset of the declared allowlist. Pure map assertion, no spawn needed.

### AC3 — Token never passed via environment
The service token is **not** placed in the child process environment. It is written to an isolated `glab` config file (see AC4). The child env contains no key whose value equals the token.
- **Test (deterministic):** build the child env from a known token value. Assert no env value equals the token string. Assert the token string does appear in the rendered config-file contents (AC4 fixture).

### AC4 — Isolated HOME / GLAB_CONFIG_DIR
The executor runs with `HOME` and `GLAB_CONFIG_DIR` pointed at a **per-invocation isolated directory**, and the token lives in `${GLAB_CONFIG_DIR}/glab-cli/config.yml` inside that directory. The operator's real `~/.config/glab-cli/config.yml` is never read or written.
- **Test (deterministic):** run the env/config builder against a temp dir. Assert `GLAB_CONFIG_DIR` and `HOME` in the child env both resolve under the temp dir, and that the config file is created there containing the token. Assert no read/write touches a path outside the temp dir (use a stub fs that records paths, assert all paths are under the temp root).

### AC5 — Minimal role frozen PER ACTION, verified before merge
Each action that can run in the auto path declares the **minimal GitLab role/scope it requires**, frozen in a single source-of-truth table in code:

| Action | Min role/scope | Auto path? |
|---|---|---|
| read MR (diff, metadata, threads/`FETCH_THREADS`) | Reporter / `read_api` | yes |
| `postComment` (`POST_COMMENT`, `THREAD_REPLY` body) | Reporter + note-create / `api` note scope | yes |
| `THREAD_RESOLVE` | Developer | **no** (see AC6) |
| `revoke` (`approvalRevocationGateway`) | Developer | **no** (see AC6) |

The executor is constructed with **only** the read + postComment capability set. Any action whose declared min role exceeds that set is **not wired** into the auto executor.
- **Test (deterministic):** assert the capability table is the single exported constant. Construct the auto executor and assert its wired action set equals exactly `{readMr, postComment}`. Assert that `THREAD_RESOLVE` and `revoke` are **not** present in the wired set. Table-driven assertion on the exported map, no model involved.

### AC6 — No write-capable executor on any auto path
After this spec, ReviewFlow has **no** write-capable executor on any auto path. `approvalRevocationGateway.revoke` and `THREAD_RESOLVE` execution are **removed from the auto executor's wiring** (`gitlab.controller.ts:938-978`) and are **explicitly out of automated scope**. They are not reachable with the read+postComment token. Any future write capability requires its own numbered spec with dedicated ACs and its own CI gate (mirroring AC8) — it MUST NOT be enabled via an ambient or "retained" token (no dormant `REVIEWFLOW_WRITE_TOKEN` escape hatch).
- **Test (deterministic):** drive the auto executor with parsed verbs including `[THREAD_RESOLVE:42]` and a revoke intent. Assert the resolve gateway and the revoke gateway receive **zero** calls (use real recording stubs, assert call count == 0). Assert `postComment` still fires for `[POST_COMMENT]`. Never assert on whether the model "obeyed" — assert on gateway call counts.

### AC7 — Unwired write verbs are inert, not errors-into-admin
When the model emits a removed verb (`THREAD_RESOLVE`, revoke), the auto executor treats it as a **no-op** (logged, dropped) — it does **not** fall back to a broader token, retry, or escalate. The job continues to completion with only read + postComment effects.
- **Test (deterministic):** feed a verb stream mixing `[POST_COMMENT]`, `[THREAD_RESOLVE:7]`, `[FETCH_THREADS]`. Assert: postComment stub called once with the expected `{projectPath, mrNumber, body}`; resolve stub called zero times; FETCH_THREADS read stub called (read is allowed); no error thrown; no admin-token gateway constructed. Assert on observable call records.

### AC8 — Privilege contract verified at build/CI (pre-merge gate)
The per-action capability table (AC5) and the auto executor's wired set are asserted by a **test that runs in CI and blocks merge**. A change that re-wires `revoke`/`THREAD_RESOLVE` into the auto executor, or that widens the token's capability set, fails this gate.
- **Test (deterministic):** a regression test imports the production wiring used by `defaultGitLabExecutor` and asserts the wired capability set is exactly `{readMr, postComment}`. Adding any write capability to the auto path turns this test red. This is a structural assertion on the production wiring object, not a runtime spawn.

### AC9 — Action-target identity pinned to trusted provenance (fail-closed)
The `(projectPath, mrNumber)` pair used to drive any executor action — including the `threadFetchGateway.fetchThreads(projectPath, mrNumber)` inventory that SPEC-198 AC-10 validates against — MUST be pinned to a **trusted, server-validated source**, never used as-is from the forgeable webhook payload (`gitlab.controller.ts:716-766`) to widen scope. Specifically:

- `projectPath` MUST resolve to a configured repository via `findRepositoryByProjectPath`; an unrecognized `projectPath` fails closed (job not started, no fetch).
- `mrNumber` MUST be the merge-request identifier that passed the upstream trusted-actor gate (SPEC-197) for that same validated `projectPath`. A `mrNumber` that does not correspond to the gated, validated MR MUST NOT be used to retarget `fetchThreads` at a different MR.
- If the trusted `(projectPath, mrNumber)` cannot be established, the action surface resolves to **empty** (fail-closed): no fetch, no thread action.

This closes the residual flagged in SPEC-198 AC-10: a forged `mrNumber` could otherwise point `fetchThreads` at a *different* MR whose authenticated inventory would then become actionable. SPEC-198 AC-10 validates targets *against* this inventory; SPEC-196 AC9 anchors *which* MR's inventory is fetched in the first place. Both are required.
- **Test (deterministic):** (1) feed a payload whose `projectPath` is not in the repository registry → assert `findRepositoryByProjectPath` returns none, no executor constructed, `fetchThreads` recorded zero calls. (2) feed a payload whose `mrNumber` differs from the gated MR for the validated project → assert `fetchThreads` is never called with the forged `mrNumber` (real recording stub, call count == 0 for the foreign MR). Assert on observable gateway call records, never on model output.

## Out of scope

- Actor authentication / `event.user.id` trust (`eventFilter.ts:122-219`) — SPEC-197/201.
- Target validation of write verbs and `FETCH_THREADS` restriction to `trusted` — SPEC-198.
- Scanning `THREAD_REPLY` bodies — SPEC-199.
- Webhook token confidentiality, rotation, and event-UUID dedup (`verifier.ts:14-85`) — SPEC-200 / SPEC-201.
- A separate, more-scoped write executor for revoke/resolve — requires its own numbered spec with an AC8-mirror CI gate; not retained as a dormant token here (AC6).
- The human chokepoint UX of SPEC-174 — this spec only bounds what the post-confirmation token can do.

## Test strategy

Detroit-style with real recording stubs (no `vi.fn`). All assertions are on **observable state**: thrown errors, env maps, rendered config-file contents, recorded filesystem paths, and gateway call counts/arguments. **No test asserts on model obedience or LLM output.** Boundaries under test:

- Token-presence fail-closed (AC1).
- Env keyset ⊆ allowlist, canary absent (AC2/AC3).
- Config-dir isolation under temp root (AC4).
- Capability table is the single source of truth; auto wired set == `{readMr, postComment}` (AC5/AC8).
- Removed verbs produce zero write-gateway calls and no escalation (AC6/AC7).
- `(projectPath, mrNumber)` provenance pin: unrecognized project / foreign MR → zero fetch, fail-closed (AC9).

Fixtures: a real recording fs stub (records every read/write path), a real recording `glab`/gateway stub (records call count + args), and a fixed token string. The CI gate (AC8) is a structural test over the production wiring object.

## Implementation order

1. AC5 capability table — frozen exported constant, single source of truth.
2. AC1 dedicated token + fail-closed construction.
3. AC2/AC3 allowlist env builder + token-never-in-env.
4. AC4 isolated `HOME`/`GLAB_CONFIG_DIR` + config-file writer.
5. AC6/AC7 unwire `revoke`/`THREAD_RESOLVE` from the auto executor at `gitlab.controller.ts:938-978`; make removed verbs inert.
6. AC9 pin `(projectPath, mrNumber)` to the validated repository + gated MR; fail-closed.
7. AC8 CI gate test over the production wiring object.

## Threat-check notes

- **Closes its part of #3 (HIGH).** The auto-confirmed hostile diff (SPEC-174 × 190) is now bounded **by construction**: the executor token carries only read-MR + postComment. Even a fully confirmed hostile diff cannot resolve threads, reply destructively as a side-effect of resolve, or revoke approvals — those gateways are unwired (AC6) and inert (AC7), and the capability set is locked by a merge-blocking CI gate (AC8). The token is unreachable from the child env (AC3) and isolated from the operator config (AC4), so a diff that exfiltrates env contents gains nothing.
- **Closes the provenance root of SPEC-198 AC-10 (#1).** AC9 anchors `(projectPath, mrNumber)` to a server-validated source. Without it, validating action targets against an authenticated inventory would be moot — a forged `mrNumber` could point `fetchThreads` at another MR whose authenticated inventory becomes actionable, displacing rather than closing the confused-deputy. AC9 anchors the trust root so the displacement does not occur.
- **Hardens the #1 (CRITICAL) blast radius without fixing its root.** Removing `revoke`/`THREAD_RESOLVE` from the auto path entirely means even a successful `trusted` unlock cannot drive them through the auto executor. Target validation of the remaining write verb body and `FETCH_THREADS` restriction stay with **SPEC-198**; `THREAD_REPLY` content scanning stays with **SPEC-199**.
- **Does NOT close #2 (CRITICAL).** `event.user.id` forgeability in GitLab.com SaaS depends on `gitlabWebhookToken` confidentiality + rotation (SPEC-201). This spec makes that an **explicit trust assumption**: if the webhook token leaks, provenance (191) is inoperative — but even then, this token's bounded capability set caps the damage at read + postComment in the auto path. Closing forgeability itself remains with the sibling spec.
- **YAGNI guardrail.** No probabilistic diff sanitization, no content heuristics, no allow/deny scoring. The bound is a static capability set + a structural CI gate — deterministic, auditable, and merge-blocking.

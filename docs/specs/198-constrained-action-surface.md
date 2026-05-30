---
title: "SPEC-198: Constrained action surface for untrusted-origin merge requests"
status: draft
labels: [gitlab, llm-output, action-surface, provenance]
visibility: PRIVATE-UNTIL-P0-SHIPPED
depends_on: [SPEC-174, SPEC-196]
blocks: [SPEC-196]
---

# SPEC-198: Constrained action surface for untrusted-origin merge requests

## Context

ReviewFlow drives a Claude review over GitLab merge requests. The LLM emits action
tokens (`threadActionsParser.ts:13-66`) that are parsed and dispatched to write
gateways (`executeThreadActions`, `contextActionsExecutor`). When a merge request
originates from an untrusted actor, every parsed write verb is an attack primitive:
the MR author controls diff content (`gitlab.controller.ts:849-1031`, read from the
worktree, non-sanitizable) and can attempt prompt injection to coerce the model into
emitting destructive verbs (`revoke`, `THREAD_RESOLVE`, `THREAD_REPLY`).

The original scope reduced the write surface to `postComment` only for untrusted
origins, and gated `THREAD_RESOLVE` / `THREAD_REPLY` / `revoke` behind a `trusted`
provenance flag. An adversarial pentest demonstrated that gating on the **verb alone**
is insufficient: once `trusted` is granted (legitimately, or via a forged unsigned
`event.user.id` — out of this spec's scope, see Threat-check), the actor can resolve or
reply to **arbitrary thread ids** not belonging to the current MR, and can use
`FETCH_THREADS` to read sensitive thread contents that are then exfiltrated through
`postComment` (read-amplification).

This amendment bounds the **impact** of each write verb deterministically — target
validation and a read-amplification gate — without adding any probabilistic layer.

**Merge order (blocking):** this spec MUST merge **before** SPEC-196. SPEC-198 hardens
the `THREAD_RESOLVE` verb (target-validation) while it still exists on the auto path;
SPEC-196 then removes the verb from the auto path entirely. If 196 lands first the verb
is gone before its validation matters; if 196 never lands the validation here keeps the
verb safe for the `trusted` / future-write-executor case. Hence `blocks: [SPEC-196]`.

## Current behavior

| Concern | Location | Behavior |
|---|---|---|
| Reviewer-added filter | `eventFilter.ts:122-185` | `checkGitLabReviewerAdded` never inspects `event.user` |
| MR-update follow-up filter | `eventFilter.ts:191-219` | `filterGitLabMrUpdate` performs no actor check |
| Note/comment inbound filter | `eventFilter.ts` `filterGitLabNoteEvent` | feeds `gitlab.controller handleGitLabNoteHook`, no actor gate |
| Static webhook token check | `verifier.ts:14-37` | `X-Gitlab-Token` compared with `timingSafeEqual` |
| HMAC body signature | `verifier.ts:43-77` | GitHub-only; GitLab does **not** sign the body |
| Event UUID dedup | `verifier.ts:82-85` | `X-Gitlab-Event-UUID` never deduplicated |
| ReviewJob construction | `gitlab.controller.ts:716-766` | built 100% from payload |
| Diff source | `gitlab.controller.ts:849-1031` | read from worktree, non-sanitizable |
| Executor wiring | `gitlab.controller.ts:938-978` | wires thread/context executors |
| Action token parser | `threadActionsParser.ts:13-66` | parses `[THREAD_RESOLVE:id]`, `[THREAD_REPLY]`, `[POST_COMMENT]`, `[FETCH_THREADS]` |
| Resolve gateway | `approvalRevocationGateway.revoke` | revokes approval |
| Comment gateway | `noteCommentPostGateway.postComment({projectPath, mrNumber, body})` | posts a note |
| Ambient executor | `routes.ts:58` `defaultGitLabExecutor` | runs with ambient admin token |
| Invocation chokepoint | `gateClaudeInvocation` + `triggerMode` (SPEC-174) | pending |

## Acceptance criteria

Provenance model (unchanged, restated for grounding):

- **AC-1 (fail-closed provenance).** Any provenance value `!== 'trusted'` resolves to
  `untrusted`. `trusted` is NEVER derived from a payload field (e.g. `event.user.id`,
  author role). *Test:* feed provenance inputs `undefined`, `''`, `'TRUSTED'`,
  `'trusted '`, `{}`; assert the resolver returns `untrusted` for all; assert it returns
  `trusted` only for the exact canonical token set by the upstream gate.

- **AC-2 (untrusted write surface = postComment only).** For an untrusted-origin MR, the
  set of executable write verbs derived from LLM output is exactly `{ postComment }`.
  *Test:* run the executor with an `untrusted` job and a parsed action list containing
  one of each verb; assert only `noteCommentPostGateway.postComment` was invoked
  (observe call records on real stub gateways), and `revoke` / resolve / reply / fetch
  stubs recorded zero calls.

- **AC-3 (parser ignores non-allowlisted types).** Tokens whose type is not in the
  allowlist are dropped at parse time and never reach an executor. *Test:* parse a
  string containing `[UNKNOWN:1]`, `[DROP_DB]`, and a valid `[POST_COMMENT]`; assert the
  result contains only the `postComment` action.

- **AC-4 (stdout / context-file parity).** The constrained surface is identical whether
  actions arrive via stdout or via the context file. *Test:* feed the same action list
  through both ingestion paths into an untrusted job; assert byte-identical executed
  action sets.

### Amended / new criteria (pentest)

- **AC-5 (FETCH_THREADS restricted to trusted — read-amplification gate).**
  `FETCH_THREADS` is a **read** verb that amplifies exfiltration via `postComment`.
  For an untrusted-origin job it is dropped before execution; it executes only when
  provenance is exactly `trusted`. *Test (deterministic, non-LLM boundary):* build two
  jobs — one `untrusted`, one `trusted` — each with a parsed `[FETCH_THREADS]` action;
  dispatch through `executeThreadActions` with real stub gateways; assert the
  thread-fetch stub recorded **0** calls for the untrusted job and **exactly 1** for the
  trusted job. No assertion touches model output.

- **AC-6 (THREAD_RESOLVE target validation).** For a `[THREAD_RESOLVE:id]` action, the
  executor resolves a thread **only if `id` belongs to the set of thread ids of the
  current MR**. An `id` outside that set is dropped (no gateway call), regardless of
  provenance. *Test:* seed the stub thread provider with current-MR thread ids
  `{ "10", "11" }`; dispatch `[THREAD_RESOLVE:10]` (in-set), `[THREAD_RESOLVE:999]`
  (out-of-set), and `[THREAD_RESOLVE:11 ]` (whitespace/format variant) on a `trusted`
  job; assert the resolve stub recorded calls for `10` (and `11` after trim) only, and
  zero call for `999`. Membership is computed from the MR thread inventory, never from
  the token payload alone.

- **AC-7 (THREAD_REPLY target validation).** For a `[THREAD_REPLY:id]` action, the
  executor replies **only if `id` belongs to the current MR's thread id set**. An
  out-of-set `id` is dropped (no gateway call), regardless of provenance. *Test:* same
  seeding as AC-6; dispatch `[THREAD_REPLY:10]` and `[THREAD_REPLY:999]` on a `trusted`
  job; assert the reply stub recorded exactly one call targeting `10` and zero call for
  `999`.

- **AC-8 (target validation precedes provenance, both required for resolve/reply).** The
  resolve/reply path requires **both** `trusted` provenance **and** in-set target
  membership; failing either drops the action with no gateway call. *Test:* matrix over
  `{trusted, untrusted} × {in-set id, out-of-set id}` for both `THREAD_RESOLVE` and
  `THREAD_REPLY`; assert a gateway call is recorded for exactly the
  `(trusted, in-set)` cell and for no other cell.

- **AC-9 (target inventory is authoritative, single source).** The current-MR thread id
  set used for AC-6/AC-7 is derived from one explicit MR-scoped inventory passed into the
  executor, not re-read from token text or LLM output. *Test:* construct an executor with
  an MR thread inventory `{ "42" }`; dispatch `[THREAD_RESOLVE:42]` while the action token
  also carries a spoofed look-alike payload claiming membership of `"7"`; assert only `42`
  is acted on and `7` records zero calls.

- **AC-10 — Action targets validated against an authenticated, complete thread inventory (fail-closed).**
  The thread inventory consumed by AC-9 to validate every `[THREAD_RESOLVE:id]` and
  `[THREAD_REPLY:id]` action MUST be resolved exclusively from the authenticated GitLab
  Threads API via `threadFetchGateway.fetchThreads(projectPath, mrNumber)`. The inventory
  MUST NOT be derived, in whole or in part, from the inbound webhook payload
  (`gitlab.controller.ts:716-766`); any thread id, count, or membership taken from it is
  untrusted and MUST be ignored when building the inventory.

  Resolution semantics (fail-closed):

  - The `projectPath` and `mrNumber` passed to `fetchThreads` MUST themselves be the
    trusted, server-validated pair pinned by **SPEC-196 AC9** (validated repository +
    gated MR). They are never taken as-is from forgeable payload fields to widen scope.
    A forged `mrNumber` MUST NOT retarget `fetchThreads` at a different MR. (Anchored in
    SPEC-196 AC9; restated here as the precondition AC-10 relies on.)
  - **Pagination completeness (hardening).** `fetchThreads` MUST follow **all** GitLab
    pagination pages and assemble the **complete** thread inventory. A partial `2xx`
    response (an un-followed `next` page link, a truncated body, a page-count mismatch)
    MUST NOT pass silently: the inventory either reflects every page or resolves to the
    **empty set** (fail-closed). A silently partial inventory is forbidden — it must be
    provably complete or provably empty, never "as many threads as the first page held".
  - If `fetchThreads` fails for any reason (network error, auth failure, non-2xx,
    timeout, malformed response, or incomplete pagination per the clause above), the
    inventory MUST resolve to the **empty set**. It MUST NOT fall back to the payload, to
    a cached prior inventory, or to a partially-built list.
  - An empty inventory means **every** `THREAD_RESOLVE` / `THREAD_REPLY` action is
    dropped: zero side effects are executed and the failure is logged. The system never
    resolves or replies to a thread it could not authenticate.
  - A `THREAD_RESOLVE:id` / `THREAD_REPLY:id` whose `id` is absent from the authenticated
    inventory MUST be dropped (consistent with AC-9), regardless of whether that id
    appeared in the payload.

  This closes the AC-9 escalation: validating against an inventory that is itself
  forgeable (or silently truncated) is equivalent to no validation. AC-10 anchors the
  inventory to authenticated, complete state.

  *Tests (deterministic, side-effect-asserting — count executed resolves/replies, not internal calls):*
  1. **Forged-inventory rejection** — webhook payload embeds a fabricated thread inventory
     (forged ids matching the parsed actions). Stub `threadFetchGateway.fetchThreads` to
     return a disjoint authenticated inventory (none of the forged ids present). Assert
     **0** resolve and **0** reply side effects — the payload-supplied ids are never honored.
  2. **Fail-closed on fetch failure** — stub `fetchThreads` to fail (reject / non-2xx).
     Provide parsed actions valid against any non-empty inventory. Assert inventory resolves
     to empty, **0** resolve and **0** reply side effects, failure logged, no payload fallback.
  3. **Fail-closed on incomplete pagination** — stub `fetchThreads` to return a first page
     that advertises a `next` page which the stub does not deliver (truncated). Assert the
     inventory resolves to **empty** (not the partial first page), and an in-set id from the
     undelivered page records **0** resolve/reply side effects.

## Out of scope

- Forgery of `event.user.id` and the upstream provenance decision that grants `trusted`
  (depends on SPEC-197 × SPEC-201; the unsigned-identity problem in GitLab.com SaaS).
- Webhook token confidentiality / rotation mechanics (SPEC-201 trust assumption).
- Event-UUID deduplication / replay protection (`verifier.ts:82-85`) — SPEC-200.
- Scope-reduction of the ambient admin token / human-confirmed-diff token surface
  (SPEC-196 × SPEC-174).
- `THREAD_REPLY` content scanning for injected payloads (SPEC-199).
- Sanitizing worktree diff content (`gitlab.controller.ts:849-1031`).

## Test strategy

- Detroit-school, real stub gateways (`noteCommentPostGateway`, `approvalRevocationGateway`,
  `threadFetchGateway`, thread-resolve, thread-reply); no `vi.fn`.
- Assertions on **observable state**: call records on stubs, executed action sets — never
  on the model's obedience to a prompt.
- Every gate (provenance, target membership, read-amplification, authenticated inventory)
  tested at its deterministic boundary with explicit in-set / out-of-set,
  trusted / untrusted, and forged / authenticated / partial-pagination inputs.
- Format variants (whitespace, casing, empty, look-alike payload) included as negative
  cases for the parser and target validator.
- Stdout vs context-file parity asserted on identical inputs (AC-4).

## Implementation order

1. Provenance resolver fail-closed (AC-1) — confirm existing behavior with tests.
2. Untrusted write-surface reduction to `postComment` (AC-2, AC-3, AC-4) — existing scope.
3. Add `FETCH_THREADS` to the trusted-gated set (AC-5).
4. Authenticated thread inventory: resolve via `threadFetchGateway.fetchThreads` on the
   SPEC-196-pinned `(projectPath, mrNumber)`; full pagination or fail-closed-empty (AC-10).
5. Thread inventory plumbing: pass the MR-scoped thread id set into the executor (AC-9).
6. Target-membership validator for `THREAD_RESOLVE` / `THREAD_REPLY` (AC-6, AC-7).
7. Compose provenance × target gate; both required for resolve/reply (AC-8).

## Threat-check notes

This spec closes **its part of trou #1** (under-bounded `trusted` blank cheque): the
write verbs unlocked by `trusted` are now bounded in **impact**, not just availability.
`THREAD_RESOLVE` / `THREAD_REPLY` validate their **target** against the current MR's
thread inventory (AC-6, AC-7, AC-8, AC-9) — a manipulated `trusted` actor can no longer
resolve/reply on arbitrary threads. `FETCH_THREADS` is restricted to `trusted` (AC-5),
removing the read-amplification path by which an untrusted actor could exfiltrate
sensitive thread content through `postComment`.

**Hole #1 (target-validation bypass) — CLOSED AT THE ROOT.** Prior state: AC-9 validated
targets against an "MR-scoped inventory". The re-pentest demonstrated that when this
inventory was sourced from the inbound webhook payload (`gitlab.controller.ts:716-766`),
it was forgeable on the same footing as `event.user.id` and the rest of the `ReviewJob`.
An attacker could forge an inventory listing the very thread ids they wished to act on,
collapsing AC-9 into a no-op. AC-10 removes the payload as a valid inventory source
entirely (authenticated GitLab Threads API only, fail-closed, complete-or-empty), and
SPEC-196 AC9 anchors the `(projectPath, mrNumber)` pinned into `fetchThreads` — so the
inventory is neither attacker-controlled nor retargetable. Hole #1 is closed at the root.

Renvoyé aux specs sœurs (explicitement hors de la garantie de 192):

- **#1 remaining (THREAD_REPLY content):** scanning the reply body for injected payloads
  is SPEC-199. 192 guarantees the reply *target* is in-set; it does not scan reply
  *content*.
- **#2 (event.user.id forgery / unsigned identity):** the decision that produces
  `trusted` is upstream (SPEC-197 × SPEC-201). 192 is fail-closed on the flag but cannot
  detect a forged identity.
- **#3 (human-confirmed hostile diff with a possibly-Developer token):** bounding what
  the non-sanitizable diff can do once confirmed, and scoping the ambient/confirmation
  token to read + `postComment` (removing `revoke`/`resolve` from the auto path), is
  SPEC-196 × SPEC-174. 192 only constrains the LLM-emitted verb surface, not the token's
  ambient capability.
- **Replay (`X-Gitlab-Event-UUID`)** — not addressed by AC-10; AC-10 addresses forgery of
  the action inventory, not replay of a legitimate event. Replay/idempotency is SPEC-200.

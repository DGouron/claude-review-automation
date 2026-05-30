# Report — SPEC-191: Team AI Insights migrated to `--bg` subscription billing

**Status:** implemented · **Shipped:** 2026-05-30 · **Branch:** `feat/191-team-insights-bg`

## What changed

Team AI Insights no longer invokes `claude --print`/`-p` (which switches to Anthropic API-pool billing on 2026-06-15). It now dispatches a `--bg` background session on the operator's Claude subscription — the same path reviews and Ember use — and reads the completed answer from the session transcript. The generated insights content is unchanged: same prompt builder, same parsing, same schema.

## Files

### Added
| File | Role |
|------|------|
| `entities/insight/aiInsightsSession.gateway.ts` | Contract: `run(prompt) → completed \| unavailable \| timed-out` |
| `usecases/insights/generateAiInsightsViaSession.usecase.ts` | Use case: guards + prompt + status→FR messages + parse |
| `usecases/insights/parseAiInsightsResponse.ts` | Byte-identical parse extracted from the old use case |
| `interface-adapters/gateways/aiInsightsSession.claude.gateway.ts` | Humble `--bg` glue (dispatch, transcript tail, stop+remove) |
| `tests/stubs/aiInsightsSession.stub.ts` | Stub for unit/acceptance tests |
| `tests/units/usecases/insights/generateAiInsightsViaSession.usecase.test.ts` | 8 unit tests |
| `tests/acceptance/191-team-insights-bg-migration.acceptance.test.ts` | 7 acceptance tests (spec scenarios) |

### Changed
| File | Change |
|------|--------|
| `entities/claudeSession/claudeSession.schema.ts` | Added `insights` jobType |
| `main/routes.ts` | Wired `AiInsightsSessionClaudeGateway` + `ProcessEnvironmentGateway` |
| `controllers/http/insights.routes.ts` | Calls `generateAiInsightsViaSession`; options now `session` + `environment` |
| `usecases/insights/generateAiInsights.usecase.ts` | Reduced to `persistAiInsightsResult` (generation moved) |
| `tests/units/architecture/noClaudePInProduction.test.ts` | Removed `claudeInsightsInvoker.ts` from the allowlist |
| `tests/.../insights.routes.test.ts`, `generateAiInsights.usecase.test.ts` | Migrated to new seam |

### Removed
- `frameworks/claude/claudeInsightsInvoker.ts` — the `-p` invoker.

## Rules → mechanism

| Spec rule | Where enforced |
|-----------|----------------|
| Subscription only, never API key | `generateAiInsightsViaSession` refuses when `environment.hasAnthropicApiKey()` |
| Dispatched as a `--bg` session | `AiInsightsSessionClaudeGateway.run` → `ClaudeSessionGateway.dispatch({ jobType: 'insights' })` |
| Identical content | Reuses `buildAiInsightsPrompt` + `parseAiInsightsResponse` |
| Answer read from transcript | Glue tails `~/.claude/projects/<slug>/<sessionId>.jsonl`, accumulates assistant text to turn-complete |
| Session cleaned up | `stop()` + `remove()` in a `finally` after the answer is read |
| Logged-out / unavailable | `unavailable` → "Impossible de générer les insights — connexion à l'abonnement Claude requise" |
| Timeout | `timed-out` → "La génération des insights a expiré" |
| No remaining `-p` | `noClaudePInProduction` test + acceptance "no remaining -p" scenario |

## Verification

`yarn verify` GREEN — 417 files, 3214 tests, typecheck + lint clean.

## Notes / follow-ups

- **Humble glue not unit-tested.** `aiInsightsSession.claude.gateway.ts` is the single unverified mechanism (like Ember's transport). Drive an insights generation end-to-end manually to confirm the transcript read against the live `claude --bg` CLI before relying on it in production.
- **Filename smell.** `generateAiInsights.usecase.ts` now only holds `persistAiInsightsResult`; renaming to `persistAiInsights.usecase.ts` is a separate, out-of-scope cleanup.
- Session `cwd` for insights is the operator `$HOME` (the prompt is self-contained, no repo needed).

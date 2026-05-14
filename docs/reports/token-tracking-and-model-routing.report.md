# Token Tracking and Hybrid Model Routing

**Spec**: # (no spec — retroactive)
**PR**: [#147](https://github.com/DGouron/review-flow/pull/147) — `feat: hybrid model routing + token usage tracking`
**Merged**: 2026-05-14T21:01:49Z — commit `2479b43c33d234a1d1ae787284cfb8d3763458bb`
**Additions / Deletions**: +985 / -35

---

## Motivation

Ahead of the 2026-06-15 billing change, where `claude -p` usage shifts to dedicated monthly credits ($20/$100/$200 for Pro/Max5x/Max20x), the default of always invoking Opus on every review became too expensive. This PR introduces cost-aware routing and usage visibility.

Also fixed a dormant bug: `defaultModel` was already parsed from per-repo config but `claudeInvoker.ts` hardcoded `'opus'` — the field was silently ignored.

---

## Scope

- **Hybrid model routing** — select `haiku` / `sonnet` / `opus` per review based on diff line count and a `routingPolicy` in `.claude/reviews/config.json`
- **Token usage tracking** — switch invoker to `--output-format stream-json --verbose`, parse the NDJSON stream, extract final `usage` block, persist to `.claude/reviews/usage.jsonl`
- **Summarize token usage** — `SummarizeTokenUsageUseCase` aggregates the JSONL for reporting (data ready; no dashboard route yet)
- **Bug fix** — `defaultModel` now actually applied by `claudeInvoker.ts`

---

## Architecture

New Clean Architecture components:

| Layer | Component | Role |
|-------|-----------|------|
| Entity | `entities/modelRouting/modelRouting.schema.ts` | `ClaudeModelName`, `RoutingPolicy` types |
| Entity | `entities/modelRouting/modelRouting.gateway.ts` | Gateway contract for routing policy read |
| Entity | `entities/tokenUsage/tokenUsage.schema.ts` | `TokenUsage`, `TokenUsageRecord` types |
| Entity | `entities/tokenUsage/tokenUsage.gateway.ts` | Gateway contract for persistence |
| Use case | `usecases/selectModelForReview/` | Routing decision: given diff size + policy → model name |
| Use case | `usecases/trackTokenUsage/` | Appends one record to usage JSONL |
| Use case | `usecases/summarizeTokenUsage/` | Aggregates all records (monthly totals) |
| Gateway | `gateways/projectConfig/routingPolicy.projectConfig.gateway.ts` | Reads `routingPolicy` from per-repo config |
| Gateway | `gateways/tokenUsage/tokenUsage.filesystem.gateway.ts` | JSONL append + read from filesystem |
| Framework | `frameworks/claude/streamJsonParser.ts` | Tolerant NDJSON parser; reconstructs assistant text + extracts `usage` |

`InvocationResult` now exposes `usage?: TokenUsage | null` and `selectedModel?: ClaudeModelName`.

---

## Routing Logic

```
routingPolicy.haikuMaxLines  → diff lines ≤ threshold  → haiku  (~1x cost)
routingPolicy.sonnetMaxLines → diff lines ≤ threshold  → sonnet (~3x cost)
otherwise                                               → opus   (~15x cost)
```

Fallback chain: `routingPolicy` absent → `defaultModel` → `opus`.
Diff stats unavailable → `defaultModel`.

---

## Tests / Verification

28 new tests added across 7 new test files:

| Test file | Coverage |
|-----------|----------|
| `streamJsonParser.test.ts` | NDJSON parsing, partial chunks, usage extraction |
| `selectModelForReview.usecase.test.ts` | Routing thresholds, fallbacks |
| `trackTokenUsage.usecase.test.ts` | Record creation + gateway delegation |
| `summarizeTokenUsage.usecase.test.ts` | Aggregation by model, monthly grouping |
| `routingPolicy.projectConfig.gateway.test.ts` | Config read, missing field defaults |
| `tokenUsage.filesystem.gateway.test.ts` | JSONL append, read, corrupt-line tolerance |
| `projectConfig.test.ts` | `defaultModel` now parsed and returned |

CI at merge: **175 suites / 1383 tests — all passing**. `yarn typecheck`, `yarn lint`, `yarn build` all green.

Manual verification pending (not blocking merge):
- Trigger a real MR review on a repo with `routingPolicy` configured
- Verify `.claude/reviews/usage.jsonl` is appended
- Verify log file contains both assistant text and raw stream-json

---

## Outstanding / Follow-ups

- Dashboard route + view to visualize monthly token consumption (`SummarizeTokenUsageUseCase` is ready, no frontend yet)
- Threshold alert when approaching plan credit limit
- `claudeInsightsInvoker.ts` not migrated to stream-json (different use case, lower volume)
- CLAUDE.md / docs not yet updated with the `routingPolicy` knob

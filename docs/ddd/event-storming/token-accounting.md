# Event Storming — Token Accounting

*Date: 2026-05-19*
*Scope: Recording and aggregation of Claude token consumption and cost per review job. Feature added after the global Event Storming of 2026-03-22.*

## Domain Events (🟧)

| Event | Trigger | Source file |
|-------|---------|-------------|
| TokenUsageRecorded | A ReviewJob completes and the Claude CLI returns usage statistics | `frameworks/claude/claudeInvoker.ts:589` |
| TokenUsageSummarized | SummarizeTokenUsage aggregates records into a cost summary (currently never invoked) | `usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.ts` |

## Commands / Use Cases (🟦)

| Command | Actor | Event produced | Source file |
|---------|-------|----------------|-------------|
| TrackTokenUsage | System (claudeInvoker, post-review) | TokenUsageRecorded | `usecases/trackTokenUsage/trackTokenUsage.usecase.ts` |
| SummarizeTokenUsage | None — no caller wired | TokenUsageSummarized | `usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.ts` |

## Entities (🟨)

| Entity | Responsibility | Files |
|--------|----------------|-------|
| TokenUsageRecord | Main entity — one immutable ledger entry binding a TokenUsage to one ReviewJob (jobId, mrNumber, platform, projectPath, model, recordedAt, localPath) | `entities/tokenUsage/tokenUsage.schema.ts` |
| TokenUsage | Value object — raw token counts (input, output, cache creation, cache read) plus dollar cost | `entities/tokenUsage/tokenUsage.schema.ts` |
| TokenUsageSummary | Read model — aggregated totals and per-model cost breakdown, output of SummarizeTokenUsage | `usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.ts` |

## Policies and Business Rules (🟪)

| Rule | Description | Source file |
|------|-------------|-------------|
| Append-only ledger | Records are appended to a JSONL file, never updated or deleted | `interface-adapters/gateways/tokenUsage/tokenUsage.filesystem.gateway.ts:15` |
| Since-date filtering | SummarizeTokenUsage aggregates only records with `recordedAt >= since` when a `since` bound is provided | `usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.ts:24` |
| Per-model aggregation | Cost and record count are accumulated per `model` identifier | `usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.ts:45` |
| Silent skip of corrupt records | `loadAll` discards JSONL lines that fail schema validation without raising an error | `interface-adapters/gateways/tokenUsage/tokenUsage.filesystem.gateway.ts:31` |

## Presenters (🟩)

*No dedicated presenters.* `TokenUsageSummary` is produced directly by the use case — it is an unprojected read model.

## Gateways and External Systems (⬜)

| System | Interaction | Gateway contract | Implementation |
|--------|-------------|-----------------|----------------|
| File System | Append and read token usage records as JSONL (`.claude/reviews/usage.jsonl`) | `entities/tokenUsage/tokenUsage.gateway.ts` (`TokenUsageGateway`) | `interface-adapters/gateways/tokenUsage/tokenUsage.filesystem.gateway.ts` (`FilesystemTokenUsageGateway`) |
| Claude CLI (stream-json) | Source of raw usage — `usage` and `total_cost_usd` extracted from the CLI `result` event | None — parsed inline, no gateway contract | `frameworks/claude/streamJsonParser.ts:100` |

## Relations with other Bounded Contexts

| Related BC | Pattern (Vaughn Vernon) | Direction | Detail |
|-----------|------------------------|-----------|--------|
| Review Execution | Customer-Supplier | Review Execution → Token Accounting | When a ReviewJob completes, `claudeInvoker` supplies the `TokenUsage` extracted from the Claude CLI stream and triggers `TrackTokenUsage`. Token Accounting is the consumer. |
| Platform Integration | Conformist | Platform Integration → Token Accounting | `TokenUsageRecord` embeds `platform: 'gitlab' \| 'github'`, `projectPath` and `mrNumber`, conforming to Platform Integration identity concepts with no Anti-Corruption Layer. |
| Statistics & Insights | Separate Ways (intended Customer-Supplier) | — | `SummarizeTokenUsage` produces a cost read model that belongs alongside Stats reporting, but no consumer is wired. The intended Customer-Supplier / Open Host Service link is missing. |

## Ubiquitous Language

| Term | Definition in this BC | Equivalent term in other BCs |
|------|----------------------|------------------------------|
| TokenUsage | Raw Claude token counts (input, output, cache creation, cache read) plus dollar cost for one model invocation | — |
| TokenUsageRecord | Immutable ledger entry binding a TokenUsage to one ReviewJob | Relates to `ReviewJob` (Review Execution) |
| TokenUsageSummary | Aggregated consumption and cost across records, broken down by model | — |
| Model | The Claude model identifier that produced the usage (raw string) | `modelRouting` selects it in Review Execution |
| costUsd | Dollar cost of one invocation, taken from the Claude CLI `total_cost_usd` field | — |

## Hot Spots (🩷)

| Problem | Severity | Detail |
|---------|----------|--------|
| SummarizeTokenUsage is never wired | 🔴 | No controller, HTTP route, MCP tool or presenter invokes `SummarizeTokenUsageUseCase`. The aggregation feature is built but unreachable — an unfinished feature loop. (`usecases/summarizeTokenUsage/`) |
| Inline use-case instantiation in framework layer | 🟠 | `claudeInvoker.ts:591` does `new TrackTokenUsageUseCase(new FilesystemTokenUsageGateway())` inside the infrastructure layer instead of receiving it from the composition root — violates the Dependency Injection convention. |
| Raw usage parsed without a gateway | 🟠 | `streamJsonParser.ts` extracts `usage` / `total_cost_usd` directly; raw-usage acquisition has no gateway contract, coupling Token Accounting input to a frameworks-layer parser. |
| No retention on the usage ledger | 🟡 | `.claude/reviews/usage.jsonl` is append-only and never pruned — it grows without bound and is not covered by the Data Lifecycle BC. |
| `model` is a raw string | 🟡 | `TokenUsageRecord.model` is `z.string()` — primitive obsession; no shared model identifier type with `modelRouting`. |

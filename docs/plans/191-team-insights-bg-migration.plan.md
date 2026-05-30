# Plan — SPEC-191: Team AI Insights `-p` → `--bg`

## Goal

Swap the Team AI Insights transport from headless `claude --print`/`-p` (API-billed after 2026-06-15) to the `--bg` subscription dispatch already used by reviews and Ember. Output stays identical — only the transport changes.

## Key finding

The insights use case depends on a `(prompt) => Promise<string>` seam, so the use case and parsing are transport-agnostic. The `--bg` "dispatch → tail transcript → answer" mechanism is already proven by Ember (`emberAnswerTransport.claude.gateway.ts`). Insights = same mechanism, **non-streaming** (single completed result), no MCP.

## Layers (Clean Architecture)

| Layer | Artifact |
|-------|----------|
| Entity (contract) | `aiInsightsSession.gateway.ts` — `run(prompt) → completed \| unavailable \| timed-out` |
| Use case | `generateAiInsightsViaSession.usecase.ts` — guards (API key / no-stats), prompt build, status→FR messages, parse |
| Use case (shared) | `parseAiInsightsResponse.ts` — byte-identical parse extracted from the old use case |
| Gateway impl (glue) | `aiInsightsSession.claude.gateway.ts` — dispatch `--bg`, tail transcript, stop+remove (humble, acceptance-tested only) |
| Composition root | `routes.ts` + `insights.routes.ts` rewired to `session` + `environment` |

## Decisions (with the operator)

- **Dedicated use case** (not a humble invoker) so the business rules / FR messages are unit-testable behind a typed seam.
- **No-stats message Frenchified** per the spec scenarios (was English).

## TDD order

1. Acceptance RED (8 spec scenarios) + use-case unit RED.
2. Contract + stub → use case GREEN.
3. `--bg` glue gateway + `insights` jobType.
4. Wire routes, delete `claudeInsightsInvoker.ts`, drop it from `noClaudePInProduction` allowlist, migrate affected tests.
5. `yarn verify` GREEN, docs.

## Out of scope

Insights content, prompt, presenter/views, streaming, multi-LLM, redesigning the `--bg` dispatch.

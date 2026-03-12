# Coding Standards — ReviewFlow

## Architecture Layers

```
src/
├── entities/                          # Domain: types, schemas, guards, value objects, gateway contracts
├── usecases/                          # Application: one intention = one use case
├── interface-adapters/
│   ├── controllers/ (webhook, http, mcp)   # Inbound: transforms events → use case calls
│   ├── gateways/ (cli, fileSystem, ...)    # Outbound: implements entity gateway contracts
│   ├── presenters/                         # Domain data → ViewModel transformation
│   ├── views/dashboard/                    # Humble Objects: render ViewModel, zero logic
│   └── adapters/                           # Data format adapters
├── frameworks/ (claude, queue, logging, settings)  # Infrastructure & libraries
├── shared/
│   ├── foundation/                    # Base classes (guards, use case interface, execution gateway)
│   └── services/                      # Cross-cutting services
├── main/                              # Composition root (routes.ts = DI wiring)
├── mcp/                               # MCP server
└── security/                          # Auth & verification
```

**Dependency Rule**: entities ← usecases ← interface-adapters ← frameworks. Never import outward.

## Naming

- **Full words only** — `existing`, `context`, `gateway`. Never `ex`, `ctx`, `gw`.
- **Files (.ts)**: camelCase with domain suffix
  - Entity: `reviewContext.ts`, `reviewScore.valueObject.ts`
  - Schema: `reviewContext.schema.ts`
  - Guard: `reviewContext.guard.ts`
  - Gateway contract: `reviewContext.gateway.ts` (lives in `entities/`)
  - Gateway impl: `threadFetch.gitlab.gateway.ts`, `reviewAction.gitlab.cli.gateway.ts`
  - Memory impl: `jobContext.memory.gateway.ts`
  - Use case: `cancelReview.usecase.ts` (class or function)
  - Presenter: `jobStatus.presenter.ts`
  - CLI: `reviewCli.cli.ts`, `startReview.cli.usecase.ts`
- **Types**: Capitalized, no "Type" suffix — `ReviewContext`, `TrackedMr`, `Platform`
- **Interfaces**: No `I` prefix — `ReviewContextGateway`, not `IReviewContextGateway`
- **`type`** for data shapes, **`interface`** for contracts/extending

## File Suffix Patterns

| Layer | Suffix | Example |
|-------|--------|---------|
| Entity/type | `.ts` or `.schema.ts` | `reviewContext.schema.ts` |
| Value Object | `.valueObject.ts` | `reviewScore.valueObject.ts` |
| Guard | `.guard.ts` | `reviewContext.guard.ts` |
| Gateway contract | `.gateway.ts` | `threadFetch.gateway.ts` |
| Gateway impl | `.<platform>.<transport?>.gateway.ts` | `threadFetch.gitlab.gateway.ts` |
| Use case | `.usecase.ts` | `cancelReview.usecase.ts` |
| Presenter | `.presenter.ts` | `jobStatus.presenter.ts` |
| Test | `.test.ts` | `cancelReview.usecase.test.ts` |
| Factory | `.factory.ts` | `reviewContext.factory.ts` |
| Stub | `.stub.ts` | `reviewContext.stub.ts` |

## Imports

- **Always** `@/` alias + `.js` extension — no exceptions, including tests
  - `import { foo } from '@/entities/review/review.schema.js'`
  - Never `import { foo } from '../../../entities/review/review.schema'`
- **No barrel exports** — direct imports only, no `index.ts` re-exports

## TypeScript

- **No `any`** — use `unknown` + type guards (Biome enforced)
- **No `as Type`** assertions — use guards/narrowing
- **`null`** for intentional absence — `undefined` banned in domain types
- **Branded types** for primitives: `type MergeRequestId = string & { readonly __brand: 'MergeRequestId' }`
- **Zod schemas** at boundaries: derive types with `z.infer<typeof schema>`
- **`async/await`** mandatory — never `.then()/.catch()` chains

## Domain Patterns

### Entity / Value Object
```typescript
export class ReviewScore {
  private constructor(private readonly props: ReviewScoreProps) {}
  static create(props: ReviewScoreProps): ReviewScore { ... }
  get total(): number { return this.props.total }
}
```

### Guard (all exports)
Every guard exports: `parse()`, `safeParse()`, `isValid()`, type guard.

### Gateway contract → implementation
- **Contract** in `src/entities/<domain>/<domain>.gateway.ts`
- **Implementation** in `src/interface-adapters/gateways/<transport>/<domain>.<platform>.gateway.ts`

## Dependency Injection

Controllers receive dependencies via typed `Dependencies` interface. Instantiation in composition root (`src/main/routes.ts`), never inside controllers.

## Views (Dashboard)

- **Humble Objects**: zero logic, render ViewModel only
- **JSDoc typed** (browser-served JS, not compiled TypeScript)
- Modular exports, functional style
- Presenter does ALL presentation logic

## Testing

- **Framework**: Vitest — `yarn test:ci`
- **School**: Detroit (Inside-Out, state-based)
- **Location**: `src/tests/units/` mirrors `src/`
- **Factories**: always, never hardcoded — `ReviewStatsFactory.create({ ... })`
- **Stubs**: `StubReviewContextGateway implements ReviewContextGateway`
- **Mocks**: only I/O boundaries (gateways, CLI, filesystem)
- **Language**: English only

## Language

- **English**: code, tests, commits, logs, technical errors, comments
- **French**: error messages and UI texts (end-user facing)

## Anti-Overengineering

- KISS: simplest solution that works
- YAGNI: no patterns for imaginary future
- 3 clear lines > 1 clever abstraction
- Business logic must exceed boilerplate — if ratio inverts, simplify

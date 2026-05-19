# Multi-LLM Support — Analysis

> Architectural analysis of what would need to change to support multiple LLM providers (OpenAI, Copilot, Ollama, etc.) instead of Claude only.

## Current State: Claude Coupling Points

### 1. Direct CLI Invocation (Strong Coupling)

| File | Coupling |
|------|----------|
| `src/frameworks/claude/claudeInvoker.ts` | `spawn()` of `claude` binary with specific flags (`--model`, `--append-system-prompt`, `--mcp-config`) |
| `src/frameworks/claude/claudeInsightsInvoker.ts` | Same pattern for insights generation |
| `src/shared/services/claudePathResolver.ts` | Hardcoded resolution of the `claude` binary path |

### 2. Claude-Specific Prompt Format

| File | Nature |
|------|--------|
| `claudeInvoker.ts:116-219` | System prompt injected via `--append-system-prompt` (Claude CLI format) |
| `src/frameworks/claude/languageDirective.ts` | Language directive in Claude format |
| `.claude/skills/*/SKILL.md` | Skills = markdown instructions read by Claude Code |

### 3. Claude-Specific Response Parsing

| File | Nature |
|------|--------|
| `src/frameworks/claude/progressParser.ts` | Regex on stdout to capture `[PROGRESS:...]`, `[PHASE:...]` |
| `src/services/threadActionsParser.ts` | Text marker parsing `[THREAD_RESOLVE:...]`, `[POST_COMMENT:...]` |

### 4. Model & Configuration

| File | Nature |
|------|--------|
| `src/frameworks/settings/runtimeSettings.ts` | `ClaudeModel = 'sonnet' \| 'opus'` — closed type |
| `src/interface-adapters/controllers/http/settings.routes.ts` | Endpoint `/api/settings/model` |

### 5. MCP (Model Context Protocol)

The MCP server (`src/mcpServer.ts`) is a protocol **specific to Claude Code**. Other LLMs have no native equivalent.

---

## What Would Need to Change

### Step 1 — LLM Gateway Contract (Entity Layer)

Create a provider-agnostic interface in the domain layer:

```
src/entities/llm/
├── llm.gateway.ts              # Interface: invokeReview(), invokeInsights()
├── llmInvocationResult.ts      # Standardized return type
└── llmProvider.ts              # Type: 'claude' | 'copilot' | 'openai' | ...
```

```typescript
interface LLMGateway {
  invokeReview(job: ReviewJob, options: InvocationOptions): Promise<LLMInvocationResult>;
  invokeInsights(prompt: string, language: Language): Promise<string>;
}
```

### Step 2 — Provider Implementations (Interface Adapters)

```
src/interface-adapters/gateways/llm/
├── llm.claude.gateway.ts       # Wraps current claudeInvoker (CLI spawn)
├── llm.copilot.gateway.ts      # GitHub Copilot API
└── llm.openai.gateway.ts       # OpenAI API
```

Each implementation handles its own specifics:
- **Claude**: CLI spawn + skills + MCP + text markers
- **Copilot/OpenAI**: HTTP API calls + structured JSON output
- **Ollama**: Local API

### Step 3 — Prompt Abstraction

Today, prompts are **Claude Code skills** (`.claude/skills/`). For other LLMs:

- Extract **review logic** from skills into provider-agnostic templates
- Each provider adapts the template to its format (system prompt, function calling, etc.)
- MCP should be replaced by a generic reporting mechanism for non-Claude providers

### Step 4 — Response Parsing Abstraction

```
src/interface-adapters/adapters/
├── responseParser.claude.ts     # Regex [PROGRESS:...], [THREAD_RESOLVE:...]
├── responseParser.openai.ts     # Parse structured JSON output
└── responseParser.ts            # Common interface
```

### Step 5 — Extended Configuration

```typescript
// Before
type ClaudeModel = 'sonnet' | 'opus';

// After
type LLMProvider = 'claude' | 'copilot' | 'openai' | 'ollama';
type ModelConfig = {
  provider: LLMProvider;
  model: string;          // 'opus', 'gpt-4o', 'copilot-chat', etc.
  apiKey?: string;         // For API-based providers
  baseUrl?: string;        // For Ollama/self-hosted
};
```

### Step 6 — Composition Root

`src/main/routes.ts` would instantiate the right gateway based on config:

```typescript
const llmGateway = createLLMGateway(config.llm); // factory pattern
```

---

## Difficulty Assessment

| Aspect | Difficulty | Reason |
|--------|-----------|--------|
| Gateway interface | Low | Pattern already mastered in the project |
| Wrap existing Claude code | Low | Move current code behind the interface |
| Integrate an API-based LLM (OpenAI) | Medium | Standard HTTP calls, structured output |
| Integrate Copilot specifically | **High** | Copilot has no public review API — it's an IDE product, not a standalone API |
| Adapt prompts/skills | **High** | The skill system relies entirely on Claude Code |
| Replace MCP | **High** | Claude-specific protocol, no universal equivalent |
| Equivalent review quality | **Unknown** | Skills are optimized for Claude; results with other LLMs will differ |

---

## Key Architectural Insight

The real blocker is not the code — it's the **interaction model**.

Claude Code works in **autonomous agent mode** with filesystem + CLI access via `spawn`. Other LLMs work in **API request/response mode**. These are fundamentally different paradigms. Plugging in GPT-4o or Copilot is not swapping a driver — it means rethinking how the LLM interacts with the code under review.

### What Already Works Well

The Clean Architecture is already in place for GitLab/GitHub via the Gateway Pattern. The entities, use cases, and most interface adapters are **LLM-agnostic**. The coupling is concentrated in `src/frameworks/claude/` — which is exactly where the frameworks layer should contain infrastructure concerns.

### The Gap

Claude was treated as **fixed infrastructure** rather than an **interchangeable external service**. The gateway abstraction pattern used for GitLab/GitHub was not applied to the LLM layer.

---

## Open Questions

1. **What does "Copilot" mean here?** Copilot has no public code review API. It's an IDE product. Are we talking about using the underlying model (GPT-4o) via OpenAI API instead?
2. **How to handle the skill system?** Skills are deeply tied to Claude Code's agent execution model. Other LLMs would need a completely different prompting strategy.
3. **Is MCP support needed for non-Claude providers?** MCP provides real-time progress tracking. Alternative providers would need a different mechanism (webhooks, polling, structured output).
4. **Quality parity**: The review skills have been fine-tuned for Claude. Switching LLMs will require prompt engineering per provider to maintain review quality.

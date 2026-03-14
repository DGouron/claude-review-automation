---
title: "SPEC-057: Interactive Agent Configuration Wizard"
issue: https://github.com/DGouron/review-flow/issues/57
labels: enhancement, cli, P1-critical
milestone: Project Bootstrapping
blocked_by: "#30 (init-project command)"
status: DRAFT
---

# SPEC-057: Interactive Agent Configuration Wizard

## Problem Statement

When a user selects "With Agents" during `reviewflow init-project` (SPEC-030), the current design hardcodes three default agents (architecture, testing, code-quality) without any user input. This creates two problems:

1. **Mismatched agents**: A backend Node.js project gets the same agents as a React frontend project. The user must manually edit `config.json` afterward to add/remove agents -- defeating the purpose of a wizard.
2. **Opaque execution model**: The user has no visibility into what each agent does, why order matters (sequential execution for memory safety), or what the resulting review pipeline looks like. They configure blindly.

The agent configuration wizard solves this by letting the user choose which review agents to include, in what order, during `init-project`.

### Persona

**Sam** -- Backend developer (from SPEC-030). After choosing "With Agents" review type, Sam sees a list of available agents with short descriptions. Sam picks the ones relevant to their Node.js API project, skipping React-specific agents. Sam confirms the order, and the generated `config.json` + `SKILL.md` reflect exactly what was selected.

## User Story

**As** a developer running `reviewflow init-project` with "With Agents" review type,
**I want** to interactively select which review agents to include and see their execution order,
**So that** my review pipeline matches my project's tech stack without manually editing config files afterward.

## Preconditions

- SPEC-030 (`reviewflow init-project`) is implemented and the "With Agents" review type path exists
- The `AgentDefinition` type (`{ name: string, displayName: string }`) exists in `src/entities/progress/agentDefinition.type.ts`
- `@inquirer/prompts` is already installed (used by existing `init` command)

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | **Agent catalog with descriptions** | A predefined catalog of available agents, each with a `name`, `displayName`, and one-line `description` |
| 2 | **Preset groups** | Quick-select groups: `backend`, `frontend`, `fullstack` -- each pre-selects a relevant subset of agents |
| 3 | **Multi-select agent picker** | Checkbox-style prompt allowing the user to select/deselect agents from the catalog |
| 4 | **Order display and confirmation** | After selection, display the execution order (array order = execution order) and ask for confirmation |
| 5 | **Custom agent name input** | Allow adding 1+ custom agents by name (for project-specific agents the user will define in their SKILL.md) |
| 6 | **Non-interactive defaults** | In `-y` mode, use the preset group `fullstack` as default agent selection |
| 7 | **Output to config.json** | Write the selected agents (in order) to the `agents` array in `.claude/reviews/config.json` |

### Out of Scope

| Item | Reason | Future |
|------|--------|--------|
| Drag-and-drop reordering in terminal | Not feasible in a standard CLI. Terminal UIs (blessed, ink) would add major dependencies for marginal value. The preset order is sensible; manual reordering can be done by editing `config.json`. | Could revisit if a TUI framework is adopted project-wide |
| Estimated review time per agent | No historical data exists. Agent duration depends on codebase size, diff size, and model speed -- not the agent itself. Displaying fake estimates would mislead users. | Revisit after collecting real timing data per agent (see stats service) |
| Custom agent skill file generation | Adding a custom agent name to config is trivial. Generating the corresponding SKILL.md section with correct MCP markers requires a separate template engine concern. | Separate ticket: "Generate custom agent skeleton in SKILL.md" |
| Followup agent configuration | Followup agents (`DEFAULT_FOLLOWUP_AGENTS`) are a separate review pipeline with different semantics. Mixing them in the same wizard would confuse users. | Separate ticket if needed |
| Agent removal/editing after init | This wizard runs during `init-project` only. Post-init changes are done via `config.json` or a future `reviewflow configure` command. | Future `reviewflow configure` ticket |

### Scope Challenge Log

| Original requirement | Challenge | Decision |
|---------------------|-----------|----------|
| "Drag/reorder execution order" | Terminal CLIs cannot do native drag-and-drop. `@inquirer/prompts` has no reorder widget. Building one requires a TUI framework (blessed/ink) -- a major new dependency for a single feature. | **Descoped.** Agents are ordered by preset group definition. User confirms order visually. Manual reordering via `config.json`. |
| "Estimated total review time based on selection" | `AgentDefinition` has no time field. No historical timing data is collected per agent. Agent duration varies by 10x depending on diff size. Any estimate would be fabricated. | **Descoped.** No estimates. Display agent count instead ("5 agents selected"). |
| "Custom agent definition support" | What does "custom" mean? Just a name in config? Or a full SKILL.md section with MCP markers? The first is trivial (text input), the second is a template generation concern. | **Simplified.** Allow adding custom agent names (text input). Warn that the user must add corresponding sections to SKILL.md manually. |

## Functional Requirements

### FR-1: Agent Catalog

A new catalog entity defines available agents with descriptions. This extends `AgentDefinition` with a `description` field and a `group` tag.

```typescript
interface AgentCatalogEntry {
  name: string;
  displayName: string;
  description: string;
  groups: Array<'backend' | 'frontend' | 'fullstack'>;
}
```

**Catalog entries** (initial set, derived from existing agents in `DEFAULT_AGENTS` and skill templates):

| name | displayName | description | groups |
|------|-------------|-------------|--------|
| `architecture` | Architecture | Code structure, dependency direction, layer violations | backend, frontend, fullstack |
| `solid` | SOLID | Single responsibility, dependency inversion, interface segregation | backend, fullstack |
| `testing` | Testing | Test coverage, test quality, missing edge cases | backend, frontend, fullstack |
| `code-quality` | Code Quality | Naming, complexity, duplication, dead code | backend, frontend, fullstack |
| `security` | Security | Secrets in code, injection risks, auth issues | backend, fullstack |
| `ddd` | DDD | Domain modeling, bounded contexts, ubiquitous language | backend |
| `react-best-practices` | React | Component patterns, hooks rules, performance | frontend, fullstack |
| `clean-architecture` | Clean Archi | Uncle Bob layers, dependency rule, use case isolation | backend |

The catalog is a static array, not a database. It lives in the domain layer alongside `AgentDefinition`.

### FR-2: Preset Groups

Before showing individual agents, prompt the user to pick a starting preset:

| Preset | Pre-selected agents |
|--------|-------------------|
| `backend` | architecture, solid, testing, code-quality, security, ddd, clean-architecture |
| `frontend` | architecture, testing, code-quality, react-best-practices |
| `fullstack` | architecture, solid, testing, code-quality, security, react-best-practices |
| `custom` | None pre-selected; user picks from scratch |

The preset pre-checks agents in the multi-select. The user can still toggle individual agents after choosing a preset.

### FR-3: Multi-Select Agent Picker

After preset selection, show a `checkbox` prompt (from `@inquirer/prompts`) with all catalog agents. Agents from the selected preset are pre-checked.

Each choice displays: `displayName — description`

Example:
```
? Select review agents: (Press <space> to select, <a> to toggle all)
  ◉ Architecture — Code structure, dependency direction, layer violations
  ◉ SOLID — Single responsibility, dependency inversion, interface segregation
  ◉ Testing — Test coverage, test quality, missing edge cases
  ◉ Code Quality — Naming, complexity, duplication, dead code
  ◉ Security — Secrets in code, injection risks, auth issues
  ◯ DDD — Domain modeling, bounded contexts, ubiquitous language
  ◯ React — Component patterns, hooks rules, performance
  ◯ Clean Archi — Uncle Bob layers, dependency rule, use case isolation
```

**Validation**: At least 1 agent must be selected. If zero selected, re-prompt with a warning.

### FR-4: Custom Agent Names

After the multi-select, ask:

```
? Add custom agents? (enter names comma-separated, or press Enter to skip)
```

If the user enters names (e.g., `api-contracts, error-handling`):
- Parse comma-separated values
- Trim whitespace, convert to kebab-case
- Generate `displayName` from name (kebab-case to Title Case)
- Append to the selected agent list
- Warn: "Custom agents require matching sections in your SKILL.md"

### FR-5: Order Confirmation

Display the final agent list in execution order (catalog order first, custom agents last):

```
Review agents (execution order):
  1. Architecture
  2. SOLID
  3. Testing
  4. Code Quality
  5. Security
  6. api-contracts (custom)
  7. error-handling (custom)

ℹ Agents run sequentially to prevent memory issues.
? Confirm this configuration? (Y/n)
```

If the user declines, loop back to the preset selection.

### FR-6: Non-Interactive Mode

When `-y` flag is set:
- Use `fullstack` preset
- No custom agents
- No confirmation prompt
- Write directly to config

### FR-7: Integration with init-project

This wizard is a **sub-step** of `reviewflow init-project` (SPEC-030), triggered only when the user selects "With Agents" review type.

**Integration point**: Between the "Review type" prompt and the file generation step in SPEC-030. The wizard returns an `AgentDefinition[]` that is written to `config.json` agents field and used to generate the corresponding SKILL.md agent sections.

The wizard does NOT run as a standalone command. It is a function called by `executeInitProject()`.

## Acceptance Criteria (Gherkin)

### Scenario 1: Nominal -- Backend preset with defaults

```gherkin
Feature: Agent Configuration Wizard

  Scenario: Select backend preset and confirm defaults
    Given I am running "reviewflow init-project /path/to/api"
    And I chose "With Agents" for review type
    When the agent configuration wizard starts
    And I select "Backend" preset
    Then agents "architecture, solid, testing, code-quality, security, ddd, clean-architecture" are pre-checked
    When I confirm the agent selection without changes
    And I skip custom agents by pressing Enter
    And I confirm the execution order
    Then the wizard returns 7 agents in catalog order
    And the agents array in config.json contains 7 entries
```

### Scenario 2: Frontend preset with agent toggle

```gherkin
  Scenario: Select frontend preset and deselect an agent
    Given the agent configuration wizard is running
    When I select "Frontend" preset
    Then agents "architecture, testing, code-quality, react-best-practices" are pre-checked
    When I deselect "architecture"
    And I confirm the selection
    And I skip custom agents
    And I confirm the execution order
    Then the wizard returns 3 agents: testing, code-quality, react-best-practices
```

### Scenario 3: Custom preset -- pick from scratch

```gherkin
  Scenario: Start with no preset and select manually
    Given the agent configuration wizard is running
    When I select "Custom" preset
    Then no agents are pre-checked
    When I select "testing" and "security"
    And I confirm the selection
    And I skip custom agents
    And I confirm the execution order
    Then the wizard returns 2 agents: testing, security
```

### Scenario 4: Adding custom agent names

```gherkin
  Scenario: Add custom agents by name
    Given the agent configuration wizard is running
    And I selected preset "Backend" and confirmed the selection
    When I am asked "Add custom agents?"
    And I enter "api-contracts, error-handling"
    Then 2 custom agents are appended to the list
    And I see a warning "Custom agents require matching sections in your SKILL.md"
    When I confirm the execution order
    Then the wizard returns 9 agents (7 catalog + 2 custom)
    And the last 2 agents are { name: "api-contracts", displayName: "Api Contracts" } and { name: "error-handling", displayName: "Error Handling" }
```

### Scenario 5: Zero agent validation

```gherkin
  Scenario: Reject empty agent selection
    Given the agent configuration wizard is running
    And I selected "Custom" preset
    When I deselect all agents and confirm
    Then I see a warning "At least 1 agent is required"
    And the agent selection prompt is shown again
```

### Scenario 6: Decline order confirmation loops back

```gherkin
  Scenario: Decline execution order returns to preset selection
    Given the agent configuration wizard is running
    And I completed agent selection
    When I see the execution order and decline confirmation
    Then the wizard loops back to the preset selection step
```

### Scenario 7: Non-interactive mode uses fullstack defaults

```gherkin
  Scenario: Non-interactive mode uses fullstack preset
    Given I am running "reviewflow init-project /path/to/app -y"
    And I chose "With Agents" implicitly (non-interactive defaults)
    When the agent wizard runs in non-interactive mode
    Then the fullstack preset agents are used: architecture, solid, testing, code-quality, security, react-best-practices
    And no confirmation prompts are shown
    And config.json contains 6 agents
```

### Scenario 8: Agent descriptions are visible in picker

```gherkin
  Scenario: Each agent shows its description in the picker
    Given the agent configuration wizard is running
    And I selected any preset
    When the multi-select prompt is displayed
    Then each choice shows "displayName -- description"
    And "Architecture" shows "Code structure, dependency direction, layer violations"
    And "Testing" shows "Test coverage, test quality, missing edge cases"
```

### Scenario 9: Custom agent name normalization

```gherkin
  Scenario: Custom agent names are normalized to kebab-case
    Given I am adding custom agents
    When I enter "  API Contracts , Error_Handling , my agent  "
    Then the agents are normalized to "api-contracts", "error-handling", "my-agent"
    And displayNames are "Api Contracts", "Error Handling", "My Agent"
```

### Scenario 10: Generated config.json matches selection

```gherkin
  Scenario: Config file reflects wizard output exactly
    Given I completed the agent wizard with agents: testing, security, api-contracts
    When init-project writes config.json
    Then the "agents" field contains exactly:
      | name           | displayName    |
      | testing        | Testing        |
      | security       | Security       |
      | api-contracts  | Api Contracts  |
    And the array order matches the execution order shown in the wizard
```

## Non-Functional Requirements

| NFR | Criteria |
|-----|----------|
| **No new dependencies** | Uses only `@inquirer/prompts` (already installed). No TUI frameworks. |
| **Execution time** | Wizard interaction is instant (no I/O, no network). Total time depends on user input speed. |
| **Testability** | All prompts are injected as dependencies (same pattern as `executeInit`). Pure functions for catalog filtering, name normalization, order generation. |
| **Backward compatibility** | `AgentDefinition` type is unchanged. The catalog is a new type extending it. Existing `config.json` files with `agents` arrays remain valid. |

## Technical Design Notes

These are implementation hints, not requirements. The implementer decides architecture.

### New Entity: Agent Catalog

Location: `src/entities/progress/agentCatalog.ts`

```typescript
interface AgentCatalogEntry {
  name: string;
  displayName: string;
  description: string;
  groups: AgentPresetGroup[];
}

type AgentPresetGroup = 'backend' | 'frontend' | 'fullstack';

const AGENT_CATALOG: AgentCatalogEntry[] = [/* ... */];

function getAgentsByPreset(preset: AgentPresetGroup): AgentCatalogEntry[] { /* ... */ }
function normalizeAgentName(input: string): string { /* kebab-case */ }
function formatAgentDisplayName(kebabName: string): string { /* Title Case */ }
```

### Wizard Function

The wizard is a pure async function with injected prompt dependencies (same pattern as `executeInit`):

```typescript
interface AgentWizardDependencies {
  selectPreset: () => Promise<AgentPresetGroup | 'custom'>;
  selectAgents: (catalog: AgentCatalogEntry[], preSelected: string[]) => Promise<AgentCatalogEntry[]>;
  inputCustomAgents: () => Promise<string>;
  confirmOrder: (agents: AgentDefinition[]) => Promise<boolean>;
}

async function runAgentWizard(deps: AgentWizardDependencies): Promise<AgentDefinition[]>
```

### Integration with SPEC-030

In `executeInitProject()`, after the "Review type" prompt returns `with-agents`:

```typescript
if (reviewType === 'with-agents') {
  if (yes) {
    agents = getAgentsByPreset('fullstack').map(toAgentDefinition);
  } else {
    agents = await runAgentWizard(wizardDeps);
  }
}
```

### Existing Code to Reuse

| Module | Reuse |
|--------|-------|
| `AgentDefinition` in `src/entities/progress/agentDefinition.type.ts` | Output type -- unchanged |
| `@inquirer/prompts` `select`, `checkbox`, `input`, `confirm` | Interactive prompts |
| `ansiColors.js` | CLI formatting (dim descriptions) |
| `DEFAULT_AGENTS` constant | Reference for initial catalog entries |

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| SPEC-030 (`init-project` command) | **Blocker** | Not yet implemented. This wizard is a sub-step of init-project. |
| `AgentDefinition` type | Entity | Exists |
| `@inquirer/prompts` | Library | Already installed |
| `DEFAULT_AGENTS` constant | Reference | Exists (but catalog extends it with descriptions) |

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | Depends on SPEC-030 for integration, but the wizard function itself is a standalone unit with injected dependencies. Can be developed and tested independently, then wired into init-project. | PASS |
| **Negotiable** | Preset groups can be adjusted. Catalog entries are negotiable. Custom agent input format is negotiable (comma-separated vs. repeated prompts). Order confirmation step could be removed if deemed unnecessary. | PASS |
| **Valuable** | Eliminates the need to manually edit `config.json` agents array after running init-project. Users get a review pipeline matched to their tech stack out of the box. | PASS |
| **Estimable** | Agent catalog is a static array. Wizard is 4 sequential prompts. Integration is a single function call in init-project. No network, no file system during wizard (only at the end when writing config). Estimate: 1-2 days. | PASS |
| **Small** | 1 new entity file (catalog), 1 wizard function, 1 integration point. ~200 lines of production code. 4 prompts. No new dependencies. | PASS |
| **Testable** | All 10 Gherkin scenarios are concrete. All prompts are injected (testable without real terminal). Catalog filtering and name normalization are pure functions. | PASS |

## Definition of Done

- [ ] `AgentCatalogEntry` type defined with `name`, `displayName`, `description`, `groups`
- [ ] `AGENT_CATALOG` constant contains 8 agents with descriptions and group tags
- [ ] `getAgentsByPreset()` returns correct agents for each preset group
- [ ] `normalizeAgentName()` converts arbitrary strings to kebab-case
- [ ] `formatAgentDisplayName()` converts kebab-case to Title Case
- [ ] Preset selection prompt works: backend, frontend, fullstack, custom
- [ ] Multi-select picker shows agents with descriptions, pre-checked by preset
- [ ] Zero-agent selection is rejected with re-prompt
- [ ] Custom agent name input works (comma-separated, normalized)
- [ ] Custom agent warning message is displayed
- [ ] Execution order display shows numbered agents
- [ ] Order decline loops back to preset selection
- [ ] Non-interactive mode (`-y`) uses fullstack preset without prompts
- [ ] Wizard returns `AgentDefinition[]` compatible with existing `config.json` format
- [ ] Integration point in `executeInitProject()` calls wizard when "With Agents" is selected
- [ ] Unit tests cover all 10 Gherkin scenarios (Detroit school, injected deps, no real terminal)
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] No `as Type` assertions, no `any`, no relative imports

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| SPEC-030 not implemented yet | Cannot integrate wizard. Development happens in isolation. | Develop wizard as a standalone tested function. Wire in when SPEC-030 lands. |
| Agent catalog becomes stale as new agents are added | New agents not available in wizard | Catalog is a single `const` array -- trivial to update. Consider generating from filesystem scan in a future iteration. |
| Users want to reorder agents but wizard does not support it | Frustration if preset order is wrong for their use case | Preset order is deliberate (architecture first = dependency rule check first). Document that order can be changed in `config.json`. Track feedback for future reorder feature. |
| Custom agent names with no matching SKILL.md section | Agent progress markers fire but no actual review happens | Warning message during wizard. Could add a `reviewflow validate` check in a future iteration. |

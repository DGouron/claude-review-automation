---
title: "SPEC-058: Multi-Language Support for Project Init"
issue: https://github.com/DGouron/review-flow/issues/58
labels: enhancement, cli, P2-important, i18n
milestone: Project Bootstrapping
blocked_by: https://github.com/DGouron/review-flow/issues/30
status: DRAFT
---

# SPEC-058: Multi-Language Support for Project Init

## Problem Statement

ReviewFlow supports EN and FR skill templates (`templates/en/`, `templates/fr/`) and injects a language directive into Claude's system prompt at review time (`buildLanguageDirective()`). However, the connection between these two systems is fragile:

1. **Language selection during `init-project` is specified but not persisted correctly**: SPEC-030 defines a language prompt (FR-3), but the generated `config.json` example in FR-5 does not include a `language` field. Meanwhile, `projectConfig.ts` reads and defaults `language` to `'en'`. The gap: templates get copied in the chosen language, but if `language` is not written to `config.json`, the review output language defaults to English regardless of what the user chose.

2. **No way to change language after init**: Once `init-project` runs, the user has no CLI command to switch the review output language. Manually editing `config.json` works but is undiscoverable and not documented.

3. **Two distinct "language" concerns are conflated in the issue**: (a) the language of the *generated skill files* (template content) and (b) the language of the *review output* (Claude's comments and reports posted to the MR/PR). These can diverge -- a user could have French skill templates but want English review output, or vice versa.

This spec addresses the end-to-end language flow: selection, persistence, review output, and post-init modification.

### Persona

**Sam** -- Backend developer, works in a French-speaking team. Uses GitLab. Ran `reviewflow init` last week. Now adding their Node.js API project. Wants review comments posted in French so the whole team understands them without translation. Later, an English-speaking contractor joins and Sam needs to switch review output to English without re-running init.

## User Story

**As** a developer initializing a project with ReviewFlow,
**I want** to choose the language for review output during `init-project` and change it later without re-running init,
**So that** code review comments are always in the language my team reads.

## Preconditions

- SPEC-030 (`reviewflow init-project`) is implemented -- this spec refines and completes its language handling
- The `Language` type (`'en' | 'fr'`) exists at `src/entities/language/language.schema.ts`
- `buildLanguageDirective()` exists at `src/frameworks/claude/languageDirective.ts` and is consumed by `claudeInvoker.ts`
- `ProjectConfig.language` is declared in `src/config/projectConfig.ts` with a fallback to `'en'`

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | **Language prompt during `init-project`** | Ask EN or FR; determines both template language and `config.json` `language` field |
| 2 | **Persist `language` in project `config.json`** | The generated `.claude/reviews/config.json` includes `"language": "en"` or `"language": "fr"` |
| 3 | **Template selection by language** | `init-project` copies skill files from `templates/<language>/` based on the user's choice |
| 4 | **Review output respects `language`** | `claudeInvoker.ts` reads `config.language` and passes it to `buildLanguageDirective()` (already implemented -- this spec validates the end-to-end chain) |
| 5 | **`reviewflow config set language <en\|fr>` command** | CLI command to change the review output language in an existing project's `config.json` without re-running init |
| 6 | **`reviewflow config get language` command** | CLI command to display the current language setting |
| 7 | **Non-interactive default** | `-y` flag defaults to `en` (English) |

### Out of Scope

| Item | Reason | Future? |
|------|--------|---------|
| Re-generating skill files when language changes | Skill files are one-time scaffolds; the user customizes them. Regeneration would overwrite user content. The `language` field only controls review *output*, not skill file content. | Maybe: `reviewflow init-project --force` could offer this |
| Languages beyond EN/FR | The `Language` schema only allows `'en' \| 'fr'`. Adding more languages requires new templates and schema extension. | Yes, when demand exists |
| Auto-detecting user locale | Over-engineering; a single prompt is sufficient | No |
| Translating existing user-written rules | The user's custom rules stay in whatever language they wrote them in | No |
| A generic `reviewflow config` command for all settings | This spec adds `config set language` and `config get language` only. A full config management system is a separate feature. | Yes (#TBD) |
| `reviewflow config set` for other keys (model, platform, etc.) | Scope creep. Language-only for now. | Yes, extend later |

### Scope Challenge: Post-Init Language Switching

The original issue requests `reviewflow config set language <en|fr>` for "post-init changes." This is worth challenging:

**What does changing language post-init actually do?** It changes the `language` field in `config.json`, which controls the `buildLanguageDirective()` system prompt injection at review time. This means Claude writes its review comments and report in the chosen language. It does NOT regenerate skill template files.

**Is this valuable enough to build?** Yes, but barely. The alternative is "open `config.json`, change `"language": "fr"` to `"language": "en"`, save." That is a 5-second manual edit. The CLI command adds discoverability and validation (rejects `"language": "de"`), but does not save significant effort.

**Decision**: Include `config set language` and `config get language` as minimal commands. They validate input against the `Language` schema and update/read a single field. This keeps the door open for extending `config` with more keys later without over-building now.

## Functional Requirements

### FR-1: Language Prompt in `init-project`

When `init-project` runs interactively, the language prompt (already defined in SPEC-030 FR-3) must:

1. Present two options: `English` and `French` (display labels)
2. Default to `English`
3. Map the selection to the `Language` type: `'en'` or `'fr'`
4. Use the selected language for two purposes:
   - Selecting the template directory (`templates/en/` or `templates/fr/`)
   - Writing the `language` field in the generated `config.json`

In `-y` (non-interactive) mode, default to `'en'`.

### FR-2: Persist Language in `config.json`

The generated `.claude/reviews/config.json` MUST include the `language` field:

```json
{
  "github": true,
  "gitlab": false,
  "defaultModel": "opus",
  "reviewSkill": "review-code",
  "reviewFollowupSkill": "review-followup",
  "language": "fr",
  "agents": []
}
```

This ensures `getProjectLanguage()` in `projectConfig.ts` reads the user's actual choice instead of falling back to `'en'`.

### FR-3: `reviewflow config set language <en|fr>`

New CLI subcommand:

```bash
reviewflow config set language fr
```

Behavior:
1. Requires a `--project` flag or operates on the current working directory
2. Locates `.claude/reviews/config.json` in the target project
3. If `config.json` does not exist, prints error: `"Projet non initialisé. Lancez 'reviewflow init-project' d'abord."` and exits with code 1
4. Validates the value against the `Language` schema (`'en'` or `'fr'`)
5. If invalid, prints error: `"Langue invalide : '<value>'. Valeurs acceptées : en, fr."` and exits with code 1
6. Updates the `language` field in `config.json`, preserving all other fields
7. Prints confirmation: `"Langue de review configurée : French"` (using the display label)

### FR-4: `reviewflow config get language`

```bash
reviewflow config get language
```

Behavior:
1. Same project resolution as FR-3
2. Reads `config.json` and displays the current language with its display label
3. Output: `"Langue actuelle : French (fr)"` or `"Langue actuelle : English (en)"`
4. If `config.json` does not exist, prints error and exits with code 1

### FR-5: End-to-End Chain Validation

The full chain must work:

```
init-project (language prompt)
  → writes config.json with language field
    → webhook triggers review job
      → claudeInvoker reads config.language
        → buildLanguageDirective(language) injected into system prompt
          → Claude writes review in chosen language
```

No new code is needed in `claudeInvoker.ts` -- the chain already exists. This FR validates that `init-project` correctly writes the `language` field so the chain is not broken by a missing field.

## Acceptance Criteria (Gherkin)

### Scenario 1: Nominal -- French language selected during init

```gherkin
Feature: Multi-language project init

  Scenario: Initialize a project with French language
    Given a git repository at "/path/to/mon-api" with a GitLab remote
    And the server config exists at "~/.claude-review/config.json"
    When I run "reviewflow init-project /path/to/mon-api"
    And I choose "French" for language
    And I complete the remaining prompts
    Then ".claude/reviews/config.json" is created at "/path/to/mon-api"
    And it contains "language": "fr"
    And ".claude/skills/review-code/SKILL.md" contains French content
    And the French content matches the structure of "templates/fr/" templates
```

### Scenario 2: Nominal -- English language selected during init

```gherkin
  Scenario: Initialize a project with English language
    Given a git repository at "/path/to/my-api" with a GitHub remote
    And the server config exists
    When I run "reviewflow init-project /path/to/my-api"
    And I choose "English" for language
    And I complete the remaining prompts
    Then ".claude/reviews/config.json" contains "language": "en"
    And ".claude/skills/review-code/SKILL.md" contains English content
```

### Scenario 3: Non-interactive defaults to English

```gherkin
  Scenario: Non-interactive mode defaults language to English
    Given a git repository at "/path/to/my-app" with a GitHub remote
    And the server config exists
    When I run "reviewflow init-project /path/to/my-app -y"
    Then ".claude/reviews/config.json" contains "language": "en"
    And skill files use English templates
```

### Scenario 4: Config set language to French

```gherkin
  Scenario: Change language to French post-init
    Given a project at "/path/to/my-app" with ".claude/reviews/config.json" containing "language": "en"
    When I run "reviewflow config set language fr --project /path/to/my-app"
    Then ".claude/reviews/config.json" contains "language": "fr"
    And all other fields in config.json are preserved unchanged
    And I see "Langue de review configurée : French"
```

### Scenario 5: Config set language with invalid value

```gherkin
  Scenario: Reject invalid language value
    Given a project at "/path/to/my-app" with ".claude/reviews/config.json"
    When I run "reviewflow config set language de --project /path/to/my-app"
    Then I see "Langue invalide : 'de'. Valeurs acceptées : en, fr."
    And the exit code is 1
    And config.json is not modified
```

### Scenario 6: Config set language on uninitialized project

```gherkin
  Scenario: Reject config set when project not initialized
    Given a directory at "/path/to/raw-project" without ".claude/reviews/config.json"
    When I run "reviewflow config set language fr --project /path/to/raw-project"
    Then I see "Projet non initialisé. Lancez 'reviewflow init-project' d'abord."
    And the exit code is 1
```

### Scenario 7: Config get language

```gherkin
  Scenario: Display current language setting
    Given a project at "/path/to/my-app" with ".claude/reviews/config.json" containing "language": "fr"
    When I run "reviewflow config get language --project /path/to/my-app"
    Then I see "Langue actuelle : French (fr)"
```

### Scenario 8: Config get language defaults when field missing

```gherkin
  Scenario: Display default language when field is absent
    Given a project at "/path/to/old-project" with ".claude/reviews/config.json" without a "language" field
    When I run "reviewflow config get language --project /path/to/old-project"
    Then I see "Langue actuelle : English (en)"
```

### Scenario 9: Language persisted in config is used at review time

```gherkin
  Scenario: Review output language matches config
    Given a project with ".claude/reviews/config.json" containing "language": "fr"
    When a review job is triggered for this project
    Then the Claude system prompt contains "WRITE YOUR ENTIRE REVIEW IN FRENCH"
    And the system prompt contains "MUST be written in French"
```

### Scenario 10: Skill file language matches template language

```gherkin
  Scenario: Generated skill uses French template structure
    Given I run "reviewflow init-project /path/to/projet" and choose "French"
    When I open ".claude/skills/review-code/SKILL.md"
    Then the section headers are in French (e.g., "Phase 1 : Contexte", "Points de Personnalisation")
    And the MCP markers remain in English ("[PHASE:initializing]", "[REVIEW_STATS:...]")
    And "<!-- CUSTOMIZE: -->" markers remain in English
```

## Technical Design Notes

These are implementation hints, not requirements.

### CLI Command Registration

Add `config` to `KNOWN_COMMANDS` in `parseCliArgs.ts`:

```typescript
interface ConfigArgs {
  command: 'config';
  subcommand: 'set' | 'get';
  key: string;         // e.g., 'language'
  value?: string;      // e.g., 'fr' (only for 'set')
  project?: string;    // --project flag, defaults to cwd
}
```

### Use Cases

| Use Case | Responsibility |
|----------|----------------|
| `setProjectLanguage.usecase.ts` | Validate language, read config.json, update `language` field, write back |
| `getProjectLanguage.usecase.ts` | Read config.json, return language with display label |

Both use cases should leverage the existing `loadProjectConfig()` from `projectConfig.ts`.

### Config File Update

For `config set`, read the raw JSON, update the single field, and write back. Do NOT use `loadProjectConfig()` for writing because it parses into a typed object and could drop unknown fields. Instead:

```typescript
const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
raw.language = validatedLanguage;
writeFileSync(configPath, JSON.stringify(raw, null, 2) + '\n');
```

### Existing Code to Reuse

| Module | Reuse |
|--------|-------|
| `languageSchema` in `src/entities/language/language.schema.ts` | Validate language input |
| `loadProjectConfig()` in `src/config/projectConfig.ts` | Read current config |
| `LANGUAGE_LABELS` in `src/frameworks/claude/languageDirective.ts` | Display labels (English, French) -- consider extracting to a shared location |

### Init-Project Integration

In the `init-project` flow (SPEC-030), ensure the `createProjectConfig` use case includes `language` in the generated `config.json`. The template already reads from the `Language` type; the fix is to pass the user's language choice through to the config writer.

## Non-Functional Requirements

| NFR | Criteria |
|-----|----------|
| **Backward compatibility** | Projects without a `language` field in `config.json` default to `'en'` (already handled by `projectConfig.ts`) |
| **Atomic write** | `config set` must not corrupt `config.json` on failure (read-modify-write with validation before write) |
| **No new dependencies** | Uses existing `languageSchema` for validation, no external i18n library |

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| SPEC-030 (`init-project`) | Blocking prerequisite | Not yet implemented -- this spec extends its language handling |
| `languageSchema` | Existing code | Exists at `src/entities/language/language.schema.ts` |
| `buildLanguageDirective()` | Existing code | Exists at `src/frameworks/claude/languageDirective.ts` |
| `loadProjectConfig()` | Existing code | Exists at `src/config/projectConfig.ts`, already reads `language` |
| `templates/en/` and `templates/fr/` | Content | Exist with full EN/FR template variants |

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | Depends on SPEC-030 for the init-project flow, but `config set/get language` commands can be built independently. The `init-project` language integration is a refinement of SPEC-030, not a new standalone feature. | PASS |
| **Negotiable** | The `config set/get` subcommand style is negotiable (could be `reviewflow set-language` instead). The number of supported languages is negotiable. Default language is negotiable. | PASS |
| **Valuable** | Closes the gap between template selection and review output language. Without this, a user choosing French templates still gets English review output if `language` is not persisted. The `config set` command adds discoverability for language switching. | PASS |
| **Estimable** | Small scope: 1 field persistence in init-project, 2 new CLI subcommands (get/set) with input validation. Estimate: 1-2 days. | PASS |
| **Small** | 2 new use cases, 1 CLI command group (`config`), 1 field addition to init-project output. No schema changes, no API changes, no new dependencies. | PASS |
| **Testable** | All 10 Gherkin scenarios are concrete and verifiable via CLI output and file content assertions. | PASS |

## Definition of Done

- [ ] `init-project` language prompt writes the chosen language to `.claude/reviews/config.json` as `"language": "en"` or `"language": "fr"`
- [ ] Generated skill files match the selected language's template directory (`templates/en/` or `templates/fr/`)
- [ ] Non-interactive mode (`-y`) defaults to `"language": "en"`
- [ ] `reviewflow config set language <en|fr>` command exists and updates `config.json`
- [ ] `reviewflow config set language` validates input against `languageSchema` and rejects invalid values
- [ ] `reviewflow config set language` preserves all other `config.json` fields
- [ ] `reviewflow config get language` displays the current language with display label
- [ ] Both `config` commands error gracefully when `config.json` is missing
- [ ] End-to-end chain works: persisted language is read by `claudeInvoker.ts` and injected via `buildLanguageDirective()`
- [ ] `parseCliArgs.ts` handles the `config` command with `set`/`get` subcommands
- [ ] Error messages are in French (end-user facing, per project language rules)
- [ ] Unit tests cover all 10 Gherkin scenarios (Detroit school, state-based)
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] No `as Type` assertions, no `any`, no relative imports

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `config set` overwrites user comments in JSON | JSON.stringify drops comments, but JSON does not support comments anyway. No risk. | N/A |
| Concurrent writes to `config.json` | Unlikely in CLI context (single user), but possible if two terminals run `config set` simultaneously | Atomic read-modify-write pattern; acceptable risk for CLI tool |
| User expects `config set language` to regenerate skill files | Confusion: language of skill files vs. language of review output are different | Clear confirmation message: "Langue de review configurée" (not "skill files regenerated"). Document the distinction in `--help` output. |
| Adding `config` command namespace early creates commitment | Future settings may not fit the `config set <key> <value>` pattern | Keep the command minimal (language-only). Extend or redesign when more keys are needed. |
| SPEC-030 not yet implemented | Cannot integrate language persistence into init-project flow | `config set/get language` commands can be built independently and merged first. Init-project integration is a refinement applied when SPEC-030 lands. |

## Relationship to Other Specs

| Spec | Relationship |
|------|-------------|
| SPEC-030 (#30, `init-project`) | This spec completes SPEC-030's language handling by ensuring the `language` field is persisted in `config.json`. The language prompt is already defined in SPEC-030 FR-3; this spec ensures it has downstream effect. |
| SPEC-056 (#56, MCP skeleton templates) | MCP templates also have EN/FR variants. The language selection in init-project determines which variant is copied. No conflict. |
| SPEC-057 (#57, agent wizard) | No interaction. Agent selection is language-independent. |

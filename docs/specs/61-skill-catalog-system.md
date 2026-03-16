---
title: "SPEC-061: Skill Catalog System"
issue: https://github.com/DGouron/review-flow/issues/61
labels: enhancement, P2-important, skills
milestone: Skill Management
status: DRAFT
---



# SPEC-061: Skill Catalog System

## Problem Statement

ReviewFlow skills are `.claude/skills/<name>/SKILL.md` files that encode domain knowledge for Claude Code sessions. Today, there are 22 skills in this project alone, covering TDD, security, architecture, code review, and more. As the skill ecosystem grows, three problems emerge:

1. **Discoverability**: A developer who wants a "security scanning" skill has no way to know one exists. There is no searchable index. The only path is word-of-mouth or browsing GitHub repositories file-by-file.

2. **Selection**: Even if a developer finds a skill, there is no metadata beyond `name` and `description` in the YAML frontmatter. There are no tags, no author, no version, no compatibility information. Choosing between two similar skills requires reading their full source.

3. **Distribution**: `reviewflow skill install` (SPEC-060) supports local paths and Git URLs, but both require knowing the exact source. There is no central place where skills are published and discovered. The `skill install <bare-name>` path currently prints "catalog not available" -- this issue delivers the catalog that unblocks it.

### What this is NOT

This is NOT a package manager (npm, pip). Skills are markdown files with optional reference documents, not executable code with dependency trees. The catalog is a curated index that points to skill sources, not a hosting platform that stores skill contents.

## User Story

**As** a developer using ReviewFlow,
**I want** a searchable catalog of available skills with metadata (name, description, tags, author, version),
**So that** I can discover, evaluate, and install skills without knowing their source locations upfront.

### Persona

**Sam** -- Backend developer managing 4 repositories with ReviewFlow. Has installed a few skills manually via `skill install /path/...` but suspects there are useful skills he does not know about. Wants to search "what security skills exist?" and install one by name.

**Alex** -- Skill author who created a custom "api-testing" skill. Wants to share it with other ReviewFlow users by adding it to the catalog so they can find and install it by name.

## Challenge: Remote Registry vs Local JSON Index

The original issue mentions "can be a simple JSON/YAML index hosted on GitHub." This is the right instinct. Here is why:

| Approach | Pros | Cons |
|----------|------|------|
| **Remote registry** (npm-like server) | Real-time updates, download counts, authentication | Massive infrastructure overhead, hosting costs, availability concerns, overkill for markdown files |
| **Local JSON index** (in-repo or GitHub-hosted) | Zero infrastructure, version-controlled, PR-based curation, works offline, Git-native | Requires manual sync, no real-time stats |

**Decision**: Start with a **static JSON index file hosted on GitHub**. This aligns with the existing convention (skills are markdown, repos are on GitHub) and avoids premature infrastructure. The catalog is a single `catalog.json` file in a dedicated GitHub repository (or the ReviewFlow repo itself) that maps skill names to their Git source URLs and metadata.

The `reviewflow` CLI fetches this file, caches it locally, and uses it to resolve `skill install <bare-name>` lookups. A contributor adds a skill to the catalog by submitting a PR that adds an entry to `catalog.json`. No server, no database, no authentication beyond GitHub.

**Upgrade path**: If the ecosystem grows beyond what a static file can handle, migrating to a hosted registry is a schema extension (add a `registryUrl` field), not a rewrite.

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | **Catalog index format** | Define a JSON schema for the catalog index file with skill entries containing: `name`, `description`, `version`, `author`, `tags`, `source` (Git URL), `homepage` (optional URL) |
| 2 | **Catalog repository** | A `catalog.json` file hosted in the ReviewFlow GitHub repo (`docs/catalog/catalog.json`) or a dedicated `reviewflow-catalog` repo |
| 3 | **`reviewflow skill search <query>`** | CLI command to search the catalog by name, tags, or description keywords |
| 4 | **`reviewflow skill list --available`** | Flag on existing `skill list` command to browse all catalog skills (deferred from SPEC-059) |
| 5 | **Catalog resolution for `skill install <bare-name>`** | When `skill install` receives a bare name, resolve it against the catalog to find the Git URL, then delegate to the existing Git URL install flow |
| 6 | **Local catalog cache** | Cache the catalog index locally at `~/.claude-review/catalog.json` with a TTL (default: 24 hours) to avoid fetching on every command |
| 7 | **`reviewflow skill catalog update`** | Force-refresh the local catalog cache from the remote source |
| 8 | **Featured/recommended skills** | A `featured` boolean field in catalog entries, surfaced in `skill search` and `skill list --available` output |
| 9 | **Version field in skill frontmatter** | Extend the SKILL.md frontmatter convention with an optional `version` field (semver) |
| 10 | **Catalog seeding** | Populate the initial catalog with the 22 existing skills from this project as reference entries |

### Out of Scope

| Item | Reason |
|------|--------|
| Hosted registry server | Premature infrastructure. A static JSON file is sufficient for the current ecosystem size. Revisit if the catalog exceeds 200 entries. |
| Skill publishing command (`skill publish`) | Publishing is a PR to the catalog repo. No CLI automation needed at this stage. |
| Skill ratings or download counts | Requires a server-side component. Not justified for a static index. |
| Automatic version conflict resolution | Skills do not have dependency trees. Version is informational metadata, not a constraint solver input. |
| Authentication / private catalogs | All skills and the catalog are public on GitHub. Private catalogs are a separate concern for enterprise use. |
| Skill dependency declaration | Skills are self-contained markdown. No skill depends on another skill for installation. |
| Multi-catalog federation | One catalog source is sufficient. Multiple catalogs (e.g., per-org) can be added later as a configuration extension. |
| Skill content hosting in the catalog | The catalog is an index (pointers), not a store. Skill content lives in its source repository. |

## Functional Requirements

### FR-1: Catalog Index Schema

The catalog is a single JSON file with the following structure:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "version": "1.0.0",
  "updatedAt": "2026-03-14T10:00:00Z",
  "skills": [
    {
      "name": "tdd",
      "description": "Interactive guide for Detroit School TDD with RED-GREEN-REFACTOR workflow.",
      "version": "1.0.0",
      "author": "ReviewFlow",
      "tags": ["testing", "tdd", "development"],
      "source": "https://github.com/DGouron/review-flow.git",
      "sourcePath": ".claude/skills/tdd",
      "homepage": "https://github.com/DGouron/review-flow",
      "featured": true
    }
  ]
}
```

**Field definitions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique skill identifier. Must match `^[a-z0-9][a-z0-9-]*$` (lowercase, hyphens, no spaces). |
| `description` | string | Yes | One-line description (max 200 characters). |
| `version` | string | Yes | Semver version string (e.g., `1.0.0`, `0.2.1`). |
| `author` | string | Yes | Author name or organization. |
| `tags` | string[] | Yes | 1-5 tags for categorization and search. Lowercase, no spaces. |
| `source` | string | Yes | Git URL where the skill can be cloned from. |
| `sourcePath` | string | No | Path within the source repository to the skill directory. Defaults to repo root. Required when the skill is inside a multi-skill repository. |
| `homepage` | string | No | URL for documentation or the skill's project page. |
| `featured` | boolean | No | Whether the skill is highlighted in search results and catalog browsing. Defaults to `false`. |

**Top-level fields**:

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Catalog schema version. Follows semver. |
| `updatedAt` | string | ISO 8601 timestamp of last catalog update. |
| `skills` | array | Array of skill entries. |

### FR-2: Catalog Hosting

The catalog file is stored at `docs/catalog/catalog.json` in the ReviewFlow repository (`DGouron/review-flow`).

**Why in the main repo** (not a separate repo):
- Skills in `.claude/skills/` are already in this repo -- the catalog indexes them from the same place
- Single PR can add a skill AND its catalog entry
- No cross-repo coordination needed for initial adoption

**Fetch URL**: The CLI fetches the catalog via the GitHub raw content URL:
```
https://raw.githubusercontent.com/DGouron/review-flow/master/docs/catalog/catalog.json
```

**Future migration**: If a dedicated `reviewflow-catalog` repo becomes necessary, the CLI reads the catalog URL from `~/.claude-review/config.json` (`catalogUrl` field), defaulting to the URL above.

### FR-3: Local Catalog Cache

The CLI caches the catalog locally to avoid network requests on every command:

- **Cache location**: `~/.claude-review/catalog.json`
- **TTL**: 24 hours (configurable via `catalogTtlHours` in config, default: 24)
- **Cache miss behavior**: Fetch from remote, write to cache, proceed
- **Cache hit behavior**: Read from cache, proceed
- **Stale cache + network error**: Use stale cache with a warning to stderr: "Using cached catalog (last updated: `<date>`). Run `reviewflow skill catalog update` to refresh."
- **No cache + network error**: Error: "Cannot fetch skill catalog. Check your internet connection." Exit 1.

### FR-4: `reviewflow skill search <query>`

Search the catalog by keyword. Matches against `name`, `description`, and `tags`.

**Matching rules**:
- Case-insensitive substring match
- Multiple query words are AND-joined (all must match across the combined `name + description + tags` text)
- Featured skills appear first in results

**Output (human-readable, default)**:

```
Searching catalog for "security"...

  * security (v1.0.0) by ReviewFlow                        [featured]
    Code scan to detect secrets before commit.
    Tags: security, secrets, scanning
    Source: https://github.com/DGouron/review-flow.git

  api-security (v0.1.0) by community-user
    API endpoint security audit with OWASP top 10.
    Tags: security, api, owasp
    Source: https://github.com/user/api-security-skill.git

2 skills found. Install with: reviewflow skill install <name>
```

**Output (`--json`)**:

```json
{
  "query": "security",
  "results": [
    {
      "name": "security",
      "description": "Code scan to detect secrets before commit.",
      "version": "1.0.0",
      "author": "ReviewFlow",
      "tags": ["security", "secrets", "scanning"],
      "source": "https://github.com/DGouron/review-flow.git",
      "sourcePath": ".claude/skills/security",
      "featured": true
    }
  ],
  "total": 2
}
```

**No results**:
```
No skills found matching "foobar".
```

### FR-5: `reviewflow skill list --available`

Extends the `skill list` command (SPEC-059) with an `--available` flag that lists all catalog skills, marking which are already installed locally.

**Output**:

```
Available skills (catalog):

  Name                    Version   Author       Tags                         Installed
  * security              1.0.0     ReviewFlow   security, secrets            Yes
  * tdd                   1.0.0     ReviewFlow   testing, tdd                 Yes
  anti-overengineering    1.0.0     ReviewFlow   architecture, yagni          Yes
  api-security            0.1.0     community    security, api, owasp         No
  react-review            0.2.0     community    react, frontend, review      No

5 skills in catalog. 3 installed locally.

  * = featured
```

Combines with `--json` for machine-readable output.

### FR-6: Catalog Resolution for `skill install <bare-name>`

When `skill install` (SPEC-060) receives a bare name argument:

1. Load the catalog (from cache or remote)
2. Look up the name in `skills[].name`
3. If found: extract `source` and `sourcePath`, delegate to the existing Git URL install flow
   - If `sourcePath` is present, clone the repo and extract only that subdirectory
4. If not found: "Skill '`<name>`' not found in catalog. Search with: reviewflow skill search `<name>`"
5. If catalog is unavailable (no cache, no network): "Cannot resolve skill name '`<name>`'. Provide a local path or Git URL instead."

This replaces the current "catalog not available" placeholder message in SPEC-060 FR-4.

### FR-7: `reviewflow skill catalog update`

Force-refresh the local catalog cache regardless of TTL:

1. Fetch catalog from remote URL
2. Validate the fetched JSON against the catalog schema
3. Write to `~/.claude-review/catalog.json`
4. Print: "Catalog updated. `<N>` skills available (last updated: `<date>`)."

**Error handling**:
- Network error: "Cannot fetch catalog. Check your internet connection." Exit 1.
- Invalid JSON: "Fetched catalog is invalid. This may be a temporary issue. Try again later." Exit 1.

### FR-8: Version Field in SKILL.md Frontmatter

Extend the skill frontmatter convention with an optional `version` field:

```yaml
---
name: tdd
description: Interactive guide for Detroit School TDD...
version: 1.0.0
---
```

- The `version` field is optional (backward compatible)
- Format: semver string
- Used by `skill list` to show the installed version alongside the catalog version
- NOT used for automatic updates or dependency resolution (out of scope)

### FR-9: Catalog Seeding

Populate the initial `catalog.json` with entries for the 22 skills currently in `.claude/skills/`:

| Skill | Tags | Featured |
|-------|------|----------|
| tdd | testing, tdd, development | Yes |
| security | security, secrets, scanning | Yes |
| clean-architecture | architecture, clean-architecture, design | Yes |
| implement-feature | automation, feature, tdd | Yes |
| product-manager | product, specs, tickets | Yes |
| anti-overengineering | architecture, yagni, simplicity | No |
| solid | architecture, solid, design | No |
| ddd | architecture, ddd, domain | No |
| refactoring | refactoring, migration, mikado | No |
| refactor-feature | refactoring, automation, specs | No |
| agent-creator | agents, automation, workflow | No |
| commit | git, workflow, commit | No |
| auto-review | review, code-quality, local | No |
| review-front | review, code-quality, frontend | No |
| review-followup | review, followup, threads | No |
| discovery | product, discovery, lean-canvas | No |
| create-doc | documentation, creation | No |
| update-docs | documentation, maintenance | No |
| audit-docs | documentation, audit, quality | No |
| docs-index | documentation, index | No |
| worktree | git, worktree, branches | No |
| e2e | testing, e2e, playwright | No |

### FR-10: Error Handling

| Situation | Behavior |
|-----------|----------|
| Network error fetching catalog | Use stale cache if available (warn); error if no cache |
| Catalog JSON is malformed | Error with message, suggest `catalog update` |
| Skill name not found in catalog | Suggest `skill search` command |
| Duplicate skill names in catalog | Reject at validation; catalog PR should not merge |
| `--available` without network and no cache | Error: "Catalog not available. Run `reviewflow skill catalog update` when online." |

## Acceptance Criteria (Gherkin)

### Scenario 1: Search the catalog by keyword

```gherkin
Feature: reviewflow skill search

  Scenario: Search catalog by keyword
    Given the catalog contains skills "security", "api-security", and "tdd"
    And "security" has tags ["security", "secrets", "scanning"]
    And "api-security" has tags ["security", "api", "owasp"]
    When I run "reviewflow skill search security"
    Then the output lists "security" and "api-security"
    And "tdd" is not in the results
    And the total shows "2 skills found"
```

### Scenario 2: Search with no results

```gherkin
  Scenario: Search returns no results
    Given the catalog contains skills "security" and "tdd"
    When I run "reviewflow skill search foobar"
    Then the output shows "No skills found matching \"foobar\"."
    And the exit code is 0
```

### Scenario 3: Featured skills appear first

```gherkin
  Scenario: Featured skills are prioritized in results
    Given the catalog contains "api-security" (not featured) and "security" (featured)
    And both match the query "security"
    When I run "reviewflow skill search security"
    Then "security" appears before "api-security" in the output
    And "security" is marked with a featured indicator
```

### Scenario 4: List available skills from catalog

```gherkin
  Scenario: Browse all catalog skills with install status
    Given the catalog contains 5 skills
    And 3 of them are installed locally
    When I run "reviewflow skill list --available"
    Then all 5 skills are listed with version, author, and tags
    And the "Installed" column shows "Yes" for the 3 installed skills
    And the "Installed" column shows "No" for the 2 not installed
```

### Scenario 5: Install a skill by bare name from catalog

```gherkin
  Scenario: Install a cataloged skill by name
    Given the catalog contains "security" with source "https://github.com/DGouron/review-flow.git" and sourcePath ".claude/skills/security"
    And the target project has a ".claude/" directory
    And no skill named "security" is installed
    When I run "reviewflow skill install security"
    Then the catalog is consulted to resolve the source URL
    And the skill is cloned and installed to ".claude/skills/security/"
    And the output shows "Installed skill 'security' from catalog"
```

### Scenario 6: Install a skill name not in catalog

```gherkin
  Scenario: Bare name not found in catalog
    Given the catalog does not contain a skill named "nonexistent"
    When I run "reviewflow skill install nonexistent"
    Then the output shows "Skill 'nonexistent' not found in catalog."
    And the output suggests "Search with: reviewflow skill search nonexistent"
    And the exit code is 1
```

### Scenario 7: Catalog cache is used within TTL

```gherkin
  Scenario: Use cached catalog without network request
    Given the local catalog cache exists and was updated 2 hours ago
    And the TTL is 24 hours
    When I run "reviewflow skill search tdd"
    Then the cached catalog is used
    And no network request is made
    And results are displayed normally
```

### Scenario 8: Stale cache with network error

```gherkin
  Scenario: Fall back to stale cache when network is unavailable
    Given the local catalog cache exists but is 48 hours old (past TTL)
    And the network is unavailable
    When I run "reviewflow skill search tdd"
    Then the stale cache is used
    And a warning shows "Using cached catalog (last updated: <date>)"
    And results are still displayed
```

### Scenario 9: Force-refresh the catalog

```gherkin
  Scenario: Manually update the catalog cache
    Given the local catalog cache is 48 hours old
    And the network is available
    When I run "reviewflow skill catalog update"
    Then the catalog is fetched from the remote URL
    And the local cache is overwritten
    And the output shows "Catalog updated. <N> skills available"
```

### Scenario 10: Catalog JSON output for search

```gherkin
  Scenario: Machine-readable search output
    Given the catalog contains "tdd" with version "1.0.0" and author "ReviewFlow"
    When I run "reviewflow skill search tdd --json"
    Then the output is valid JSON
    And it contains a "results" array with 1 entry
    And the entry has "name", "description", "version", "author", "tags", "source"
```

### Scenario 11: No catalog cache and no network

```gherkin
  Scenario: Catalog unavailable without cache or network
    Given no local catalog cache exists
    And the network is unavailable
    When I run "reviewflow skill search tdd"
    Then the output shows "Cannot fetch skill catalog. Check your internet connection."
    And the exit code is 1
```

### Scenario 12: Catalog schema validation

```gherkin
  Scenario: Reject malformed catalog JSON
    Given the remote catalog contains invalid JSON
    When I run "reviewflow skill catalog update"
    Then the output shows "Fetched catalog is invalid"
    And the local cache is NOT overwritten
    And the exit code is 1
```

### Scenario 13: Catalog entry with sourcePath extracts subdirectory

```gherkin
  Scenario: Install skill from a multi-skill repository using sourcePath
    Given the catalog entry for "tdd" has source "https://github.com/DGouron/review-flow.git" and sourcePath ".claude/skills/tdd"
    When I run "reviewflow skill install tdd"
    Then the repository is cloned
    And only the ".claude/skills/tdd" subdirectory is extracted
    And it is installed to ".claude/skills/tdd/" in the target project
```

## Non-Functional Requirements

| NFR | Criteria |
|-----|----------|
| **Catalog fetch time** | < 3 seconds to fetch and parse `catalog.json` (GitHub raw content, single file) |
| **Cache read time** | < 100ms to read and parse the local cache |
| **Search time** | < 200ms for in-memory search across up to 500 catalog entries |
| **No side effects** | `skill search` and `skill list --available` are read-only. Only `skill catalog update` writes the cache file. `skill install` writes to the target project. |
| **Offline resilience** | Commands degrade gracefully with stale cache. Only `catalog update` requires network. |
| **Stdout / stderr** | Data output (results, JSON) goes to stdout. Warnings and errors go to stderr. |
| **Exit codes** | 0 = success (even if no results). 1 = error (network failure, invalid input, catalog unavailable). |
| **Backward compatibility** | Existing `skill list` (SPEC-059) without `--available` is unchanged. Existing `skill install` with paths/URLs is unchanged. Only the bare-name path gains catalog resolution. |

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | Depends on `skill` subcommand group (SPEC-059) for CLI structure. Does NOT depend on any unbuilt infrastructure -- uses GitHub raw content for hosting, local JSON for caching. Can be implemented and tested without any external service. | PASS |
| **Negotiable** | Catalog hosting location (in-repo vs. separate repo) is negotiable. JSON vs YAML is negotiable (spec chooses JSON for tooling simplicity). Tag taxonomy is negotiable. Featured curation criteria are negotiable. Cache TTL is negotiable. | PASS |
| **Valuable** | Unlocks the `skill install <bare-name>` path (currently blocked). Gives discoverability to the growing skill library. Enables the "skill marketplace" vision without premature infrastructure. Foundation for `skill list --available` (deferred from SPEC-059). | PASS |
| **Estimable** | JSON schema definition is straightforward. HTTP fetch + local file caching is a well-known pattern. Search is in-memory substring matching on a small dataset. CLI commands follow the existing pattern. Estimate: 3-5 days. | PASS |
| **Small** | One JSON schema, one cached file, two new CLI commands (`skill search`, `skill catalog update`), one flag (`--available`), one integration point (bare-name resolution in `skill install`). No server, no database, no authentication. | PASS |
| **Testable** | All 13 scenarios are concrete with deterministic inputs and outputs. Network I/O (HTTP fetch) is injectable via a gateway interface. Filesystem cache is injectable via the existing gateway pattern. | PASS |

## Definition of Done

- [ ] Catalog JSON schema defined and documented
- [ ] `docs/catalog/catalog.json` created with initial 22 skill entries
- [ ] Zod schema for catalog validation in domain layer
- [ ] `reviewflow skill search <query>` command registered in CLI parser
- [ ] Search matches against `name`, `description`, and `tags` (case-insensitive, AND-joined words)
- [ ] Featured skills appear first in search results
- [ ] Human-readable and `--json` output for `skill search`
- [ ] `reviewflow skill list --available` flag shows all catalog skills with install status
- [ ] Local catalog cache at `~/.claude-review/catalog.json` with configurable TTL
- [ ] `reviewflow skill catalog update` force-refreshes the cache
- [ ] Stale cache fallback when network is unavailable
- [ ] Bare-name resolution in `skill install` delegates to catalog lookup then Git URL install
- [ ] `sourcePath` support: extract subdirectory from multi-skill repositories
- [ ] Error messages are actionable (suggest next command, link to issue)
- [ ] `version` field added to skill frontmatter convention (optional, backward compatible)
- [ ] Unit tests cover all 13 Gherkin scenarios (Detroit school, state-based)
- [ ] Gateway interfaces for HTTP fetch and filesystem cache (injectable, testable)
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] No `as Type` assertions, no `any`, no relative imports

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| GitHub raw content rate limiting | Catalog fetch fails for heavy users | Local cache with 24h TTL means at most 1 fetch per day per user. Rate limit is 60 req/hr for unauthenticated, far above usage. |
| Catalog grows too large for a single JSON file | Slow to fetch and parse | At 500 entries with full metadata, the file is ~100KB. GitHub raw content serves files up to 100MB. Revisit if ecosystem exceeds 500 skills. |
| Stale catalog shows skills that no longer exist | Install fails for removed skills | `skill install` failure message is clear. Catalog curation via PRs ensures removals are deliberate. |
| Skill name squatting | Popular names taken by low-quality skills | PR-based curation acts as a gatekeeper. Catalog maintainers review entries before merge. |
| `sourcePath` pointing to a moved/deleted directory | Install fails after clone | Clear error: "Skill not found at path '`<sourcePath>`' in repository." Catalog PR should be updated. |
| Breaking change to catalog schema | Older CLI versions cannot parse new catalog | `version` field in catalog enables schema migration. CLI validates against expected version and warns if incompatible. |

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `skill` subcommand group in CLI (`parseCliArgs.ts`) | Implementation prerequisite | Introduced by SPEC-059 |
| `skill install` Git URL flow (SPEC-060) | Runtime dependency for bare-name install | SPEC-060 defines the Git clone + extract flow |
| `skill list` command (SPEC-059) | Extension point for `--available` flag | SPEC-059 defines the base command |
| GitHub raw content API | Runtime dependency for catalog fetch | Public, no authentication required |
| `.claude/skills/<name>/SKILL.md` convention | Convention | Exists (used by all current skills) |
| YAML frontmatter format | Convention | Exists; extended with optional `version` field |

## Architecture Notes

Following the project's Clean Architecture:

- **Entity**: `skillCatalog.schema.ts` -- Zod schema for catalog JSON validation. `skillCatalogEntry.ts` -- type for a single catalog entry.
- **Use case**: `searchCatalog.usecase.ts` -- loads catalog (cache or remote), filters by query, returns results. `updateCatalog.usecase.ts` -- fetches remote catalog, validates, writes cache. `resolveCatalogSkill.usecase.ts` -- looks up a bare name, returns source URL + path.
- **Gateway contract**: `catalogFetch.gateway.ts` in `entities/` -- interface for fetching the remote catalog (HTTP). `catalogCache.gateway.ts` in `entities/` -- interface for reading/writing the local cache.
- **Gateway implementation**: `catalogFetch.http.gateway.ts` -- fetches via `fetch()` or `https.get()`. `catalogCache.local.gateway.ts` -- reads/writes `~/.claude-review/catalog.json`.
- **Controller**: CLI commands delegate to use cases. The `skill install` controller checks source type and, for bare names, calls `resolveCatalogSkill` before delegating to the existing install flow.

All external I/O (HTTP, filesystem) is injected via dependency interfaces, enabling Detroit-school testing with stubs.

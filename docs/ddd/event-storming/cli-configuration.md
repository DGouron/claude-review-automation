# Event Storming — CLI & Configuration

*Date: 2026-03-22*
*Scope: Daemon lifecycle, project configuration, MCP setup, versioning and self-update*

## Domain Events (🟧)

| Event | Trigger | Source file |
|-------|---------|-------------|
| DaemonStarted | CLI `start` command | `usecases/cli/startDaemon.usecase.ts` |
| DaemonStopped | CLI `stop` command | `usecases/cli/stopDaemon.usecase.ts` |
| DaemonAlreadyRunning | Start attempted while running | `usecases/cli/startDaemon.usecase.ts` |
| ConfigWritten | `init` command completes | `usecases/cli/writeInitConfig.usecase.ts` |
| ConfigValidated | Config check passes | `usecases/cli/validateConfig.usecase.ts` |
| ConfigInvalid | Config check fails with issues | `usecases/cli/validateConfig.usecase.ts` |
| RepositoriesAdded | New repos added to config | `usecases/cli/addRepositoriesToConfig.usecase.ts` |
| RepositoriesDiscovered | Git repos found via filesystem scan | `usecases/cli/discoverRepositories.usecase.ts` |
| McpConfigured | MCP server entry added to Claude settings | `usecases/cli/configureMcp.usecase.ts` |
| VersionChecked | npm version check completed | `usecases/version/checkVersion.usecase.ts` |
| UpdateAvailable | Newer version detected | `usecases/version/checkVersion.usecase.ts` |
| SelfUpdateStarted | Global update command triggered | `usecases/version/triggerSelfUpdate.usecase.ts` |
| FollowupImportantsTriggered | CLI triggers followup for important MRs | `usecases/cli/followupImportants.usecase.ts` |

## Commands / Use Cases (🟦)

| Command | Actor | Event produced | Source file |
|---------|-------|----------------|-------------|
| StartDaemon | User (CLI) | DaemonStarted, DaemonAlreadyRunning | `usecases/cli/startDaemon.usecase.ts` |
| StopDaemon | User (CLI) | DaemonStopped | `usecases/cli/stopDaemon.usecase.ts` |
| QueryStatus | User (CLI) | — (query) | `usecases/cli/queryStatus.usecase.ts` |
| ReadLogs | User (CLI) | — (query/stream) | `usecases/cli/readLogs.usecase.ts` |
| WriteInitConfig | User (CLI `init`) | ConfigWritten | `usecases/cli/writeInitConfig.usecase.ts` |
| ValidateConfig | User (CLI) | ConfigValidated, ConfigInvalid | `usecases/cli/validateConfig.usecase.ts` |
| AddRepositoriesToConfig | User (CLI) | RepositoriesAdded | `usecases/cli/addRepositoriesToConfig.usecase.ts` |
| DiscoverRepositories | User (CLI) | RepositoriesDiscovered | `usecases/cli/discoverRepositories.usecase.ts` |
| ConfigureMcp | User (CLI) | McpConfigured | `usecases/cli/configureMcp.usecase.ts` |
| CheckVersion | System (startup) | VersionChecked, UpdateAvailable | `usecases/version/checkVersion.usecase.ts` |
| TriggerSelfUpdate | User (CLI/dashboard) | SelfUpdateStarted | `usecases/version/triggerSelfUpdate.usecase.ts` |
| FollowupImportants | User (CLI) | FollowupImportantsTriggered | `usecases/cli/followupImportants.usecase.ts` |

## Entities (🟨)

| Entity | Responsibility | Files |
|--------|----------------|-------|
| PackageVersion | npm version check result and current version info | `entities/packageVersion/packageVersion.ts`, `packageVersion.schema.ts`, `packageVersion.guard.ts` |
| McpSettings | MCP server configuration in Claude settings | `entities/mcpSettings/mcpSettings.schema.ts`, `mcpSettings.guard.ts` |
| Language | UI language enum (en/fr) | `entities/language/language.schema.ts` |

## Policies and Business Rules (🟪)

| Rule | Description | Source file |
|------|-------------|-------------|
| PID file management | Daemon uses PID file to detect if already running | `usecases/cli/startDaemon.usecase.ts` |
| Version cache expiration | Version check result cached to avoid repeated npm calls | `entities/packageVersion/versionCache.gateway.ts` |
| Platform detection | Repository platform (GitLab/GitHub) detected from git remote URL | `usecases/cli/discoverRepositories.usecase.ts` |
| MCP server path resolution | Resolves absolute path to `dist/mcpServer.js` for Claude settings | `usecases/cli/configureMcp.usecase.ts` |
| Config validation rules | Validates server, user, queue, repositories sections + .env file | `usecases/cli/validateConfig.usecase.ts` |

## Presenters (🟩)

*No dedicated presenters — CLI output handled directly by CLI adapters.*

## Gateways and External Systems (⬜)

| System | Interaction | Gateway contract | Implementation |
|--------|-------------|-----------------|----------------|
| File System | PID file read/write | (inline in use cases) | `shared/services/pidFileManager.js` |
| File System | Config file read/write | (inline in use cases) | Direct `fs` usage |
| npm registry | Fetch latest package version | `entities/packageVersion/packageVersion.gateway.ts` | `interface-adapters/gateways/packageVersion.npm.gateway.ts` |
| Shell | Execute `npm install -g` | `entities/packageVersion/selfUpdateCommand.gateway.ts` | `interface-adapters/gateways/selfUpdate.cli.gateway.ts` |
| In-memory | Cache version check result | `entities/packageVersion/versionCache.gateway.ts` | `interface-adapters/gateways/versionCache.memory.gateway.ts` |
| Claude settings | Read/write `~/.claude/settings.json` | (inline in use case) | Direct file manipulation |
| HTTP | Trigger followup via server API | (inline in use case) | Direct `fetch()` call |

## Relations with other Bounded Contexts

| Related BC | Pattern (Vaughn Vernon) | Direction | Detail |
|-----------|------------------------|-----------|--------|
| Review Execution | Separate Ways | — | CLI manages daemon lifecycle; review execution happens independently once server is running |
| Tracking | Open Host Service | CLI → Tracking | FollowupImportants triggers review via HTTP API endpoint |

## Ubiquitous Language

| Term | Definition in this BC | Equivalent term in other BCs |
|------|----------------------|------------------------------|
| Daemon | Background server process managed by CLI | Server in Review Execution |
| Config | JSON configuration file for ReviewFlow | — |
| Repository | Configured git repo with platform info | — |

## Hot Spots (🩷)

| Problem | Severity | Detail |
|---------|----------|--------|
| Direct `fs` usage in use cases | 🟠 | Several CLI use cases (writeInitConfig, validateConfig, addRepositories) use `fs` directly instead of through gateway contracts — violates dependency rule |
| FollowupImportants via HTTP | 🟡 | CLI command triggers followup via HTTP fetch to own server — indirect coupling, assumes server is running |
| No gateway for Claude settings | 🟡 | ConfigureMcp reads/writes `~/.claude/settings.json` directly — no abstraction for Claude settings management |

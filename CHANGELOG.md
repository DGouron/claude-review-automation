# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-07

### Added

- **Webhook server** for GitLab merge requests and GitHub pull requests
- **Dual platform support**: GitLab (native webhooks) and GitHub (webhooks + label triggers)
- **Claude CLI integration** with automatic path resolution
- **MCP server** for real-time review progress tracking
- **Real-time dashboard** with WebSocket updates, review history, and per-project tracking
- **Review context files** with live tracking and Claude write capability
- **Review skills system** with EN/FR templates for customizable review prompts
- **Standardized review markers** parsing and execution for thread actions
- **Thread synchronization** between review comments and MR/PR discussions
- **Auto-followup** toggle to re-check resolved issues
- **Auto-cleanup** of tracking data when MR/PR is closed or merged
- **Queue system** with deduplication to prevent concurrent reviews
- **Composition Root** with full dependency injection (Clean Architecture)
- **Gateway pattern** for external service decoupling (GitLab CLI, GitHub CLI)
- **Presenters and value objects** for domain-driven data transformation
- **90+ unit tests** with Vitest
- **GitHub Actions CI** with TypeScript validation, Biome linting, and tests
- **Comprehensive documentation**: architecture, quickstart, config reference, troubleshooting

### Security

- Webhook signature verification with timing-safe comparison
- CLI argument escaping to prevent injection
- No sensitive data in production logs

[1.0.0]: https://github.com/DGouron/claude-review-automation/releases/tag/v1.0.0

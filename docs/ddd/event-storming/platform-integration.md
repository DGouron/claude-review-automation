# Event Storming — Platform Integration

*Date: 2026-03-22*
*Scope: Anti-Corruption Layer — GitLab and GitHub webhook handling, platform API interactions*

## Domain Events (🟧)

| Event | Trigger | Source file |
|-------|---------|-------------|
| WebhookReceived | HTTP POST from GitLab/GitHub | `interface-adapters/controllers/webhook/gitlab.controller.ts`, `github.controller.ts` |
| ReviewerAssigned | GitLab MR reviewer added | `interface-adapters/controllers/webhook/eventFilter.ts` (`filterGitLabEvent`) |
| ReviewRequestedByLabel | GitHub PR `needs-review` label added | `interface-adapters/controllers/webhook/eventFilter.ts` (`filterGitHubLabelEvent`) |
| MrUpdated | New commits pushed to existing MR | `interface-adapters/controllers/webhook/eventFilter.ts` (`filterGitLabMrUpdate`) |
| MrClosed | MR/PR closed without merge | `interface-adapters/controllers/webhook/eventFilter.ts` (`filterGitLabMrClose`, `filterGitHubPrClose`) |
| MrMerged | MR merged into target branch | `interface-adapters/controllers/webhook/eventFilter.ts` (`filterGitLabMrMerge`) |
| MrApproved | MR approved by reviewer | `interface-adapters/controllers/webhook/eventFilter.ts` (`filterGitLabMrApprove`) |
| SignatureVerified | Webhook HMAC signature validated | `security/verifier.ts` |
| SignatureRejected | Invalid webhook signature | `security/verifier.ts` |

## Commands / Use Cases (🟦)

| Command | Actor | Event produced | Source file |
|---------|-------|----------------|-------------|
| HandleGitLabWebhook | GitLab (webhook) | Multiple (dispatches to domain use cases) | `interface-adapters/controllers/webhook/gitlab.controller.ts` |
| HandleGitHubWebhook | GitHub (webhook) | Multiple (dispatches to domain use cases) | `interface-adapters/controllers/webhook/github.controller.ts` |
| VerifyWebhookSignature | System | SignatureVerified, SignatureRejected | `security/verifier.ts` |
| FilterEvent | System | Determines which domain flow to trigger | `interface-adapters/controllers/webhook/eventFilter.ts` |

## Entities (🟨)

| Entity | Responsibility | Files |
|--------|----------------|-------|
| GitLabMergeRequestEvent | Validated GitLab webhook payload (Zod schema) | `entities/gitlab/gitlabMergeRequestEvent.guard.ts` |
| GitHubPullRequestEvent | Validated GitHub webhook payload (Zod schema) | `entities/github/githubPullRequestEvent.guard.ts` |
| DiffMetadata | Commit SHAs for inline comment positioning | `entities/diffMetadata/diffMetadata.gateway.ts` |

## Policies and Business Rules (🟪)

| Rule | Description | Source file |
|------|-------------|-------------|
| Event filtering | Only specific event combinations trigger reviews (reviewer assigned, label added, MR updated) | `interface-adapters/controllers/webhook/eventFilter.ts` |
| Assignee extraction | Prefers MR assignee (`event.assignees[0]`) over webhook sender (`event.user`) | `interface-adapters/controllers/webhook/gitlab.controller.ts` |
| Platform-specific thread format | GitLab uses REST API discussions, GitHub uses GraphQL review threads | `interface-adapters/gateways/threadFetch.gitlab.gateway.ts`, `threadFetch.github.gateway.ts` |
| Inline comment positioning | Requires diff metadata (base/head SHA) for accurate code positioning | `interface-adapters/gateways/cli/reviewAction.gitlab.cli.gateway.ts` |

## Presenters (🟩)

*No dedicated presenters — platform data is transformed by controllers (ACL) and adapters.*

## Gateways and External Systems (⬜)

| System | Interaction | Gateway contract | Implementation |
|--------|-------------|-----------------|----------------|
| GitLab REST API | Thread fetching via `glab api` | `entities/threadFetch/threadFetch.gateway.ts` | `interface-adapters/gateways/threadFetch.gitlab.gateway.ts` |
| GitHub GraphQL API | Thread fetching via `gh api graphql` | `entities/threadFetch/threadFetch.gateway.ts` | `interface-adapters/gateways/threadFetch.github.gateway.ts` |
| GitLab REST API | Diff metadata (commit SHAs) | `entities/diffMetadata/diffMetadata.gateway.ts` | `interface-adapters/gateways/diffMetadataFetch.gitlab.gateway.ts` |
| GitHub REST API | Diff metadata | `entities/diffMetadata/diffMetadata.gateway.ts` | `interface-adapters/gateways/diffMetadataFetch.github.gateway.ts` |
| GitLab REST API | Diff stats (additions, deletions) | `entities/diffStats/diffStatsFetch.gateway.ts` | `interface-adapters/gateways/diffStatsFetch.gitlab.gateway.ts` |
| GitHub REST API | Diff stats | `entities/diffStats/diffStatsFetch.gateway.ts` | `interface-adapters/gateways/diffStatsFetch.github.gateway.ts` |
| GitLab CLI (`glab`) | Execute actions (resolve, comment, label) | `entities/reviewAction/reviewAction.gateway.ts` | `interface-adapters/gateways/cli/reviewAction.gitlab.cli.gateway.ts` |
| GitHub CLI (`gh`) | Execute actions | `entities/reviewAction/reviewAction.gateway.ts` | `interface-adapters/gateways/cli/reviewAction.github.cli.gateway.ts` |

## Relations with other Bounded Contexts

| Related BC | Pattern (Vaughn Vernon) | Direction | Detail |
|-----------|------------------------|-----------|--------|
| Review Execution | Anti-Corruption Layer | Platform → Review | Controllers transform platform events into domain ReviewRequest, create ReviewContext, execute ReviewActions |
| Tracking | Anti-Corruption Layer | Platform → Tracking | Controllers call TrackAssignment, RecordPush, TransitionState with domain-transformed data |
| Statistics & Insights | Customer-Supplier | Platform → Stats | DiffStatsFetchGateway provides platform-specific implementations for stats backfill |

## Ubiquitous Language

| Term | Definition in this BC | Equivalent term in other BCs |
|------|----------------------|------------------------------|
| MergeRequest | GitLab-specific MR payload | ReviewRequest in domain |
| PullRequest | GitHub-specific PR payload | ReviewRequest in domain |
| Discussion | GitLab comment thread | Thread in domain |
| Review Comment | GitHub review thread | Thread in domain |
| iid | GitLab MR number | reviewRequestNumber in domain |
| number | GitHub PR number | reviewRequestNumber in domain |

## Hot Spots (🩷)

| Problem | Severity | Detail |
|---------|----------|--------|
| Controller orchestration overload | 🔴 | GitLab controller handles: signature verification, event filtering, assignment tracking, context creation, Claude invocation, action execution, stats recording — 400+ lines with too many responsibilities |
| Duplicated controller logic | 🟠 | GitLab and GitHub controllers share ~60% similar logic (context creation, action execution, stats recording) — no shared abstraction |
| CLI tool dependency | 🟠 | All platform interactions depend on `glab`/`gh` CLI tools being installed and authenticated — no fallback mechanism |
| Thread format divergence | 🟡 | GitLab REST vs GitHub GraphQL produce different thread structures — unified mapping is fragile |

---
title: "SPEC-185: Setup Wizard — MCP agent fallback"
status: drafted
milestone: Setup Wizard Jarvis
depends_on:
  - "183-setup-wizard-cli-orchestrator"
priority: deferred
deferred_reason: "Implement only after SPEC-183 ships and real-user feedback shows where the scripted flow fails to handle free-form input"
---

# SPEC-185: Setup Wizard — MCP agent fallback

## Context

The scripted wizard from SPEC-183 handles the well-defined 80% of setup paths perfectly. The remaining 20% are unstructured situations: monorepos, custom tech stacks, partial existing configurations, ambiguous git layouts, or simply users asking free-form questions while in the middle of setup. For these cases, a Claude agent invoked over MCP can interpret the user's intent and either guide them through a non-standard path or call back into the structured wizard with corrected inputs.

This spec is **drafted now to lock the vision**, but its **implementation is deferred** until real telemetry from SPEC-183 shows where users actually get stuck. Building it speculatively would risk creating magic for problems that do not exist.

## Rules

- the agent fallback is opt-in only: triggered by `reviewflow setup --ai` flag or by the dashboard wizard "Ask Jarvis" button
- the agent never executes destructive actions directly: it can only call structured MCP tools that mirror SPEC-183 steps
- the agent operates inside a sandboxed conversation: it cannot read or write files outside the MCP tool surface
- the MCP tool surface is the same 10 steps from SPEC-183, exposed as discrete tools the agent can invoke
- the agent always confirms with the user before invoking a tool that writes (idempotent reads do not need confirmation)
- the agent is launched via `claude --bg` so its lifecycle is independent of the wizard subprocess
- token consumption is tracked per setup session and capped at a configurable limit (default 100k tokens)
- on token cap reached, the agent gracefully hands back control to the scripted wizard with a summary of what was attempted
- the agent receives structured context on launch: current setup state, machine info, project info — no raw file content beyond what MCP tools expose
- the agent communicates with the dashboard via the same SSE stream as SPEC-184 but with a distinct event type `agent_message`

## Scenarios

### Activation

- ai flag with default scripted resolution: {input: "/home/u/api"} → scripted wizard handles it, agent not invoked, zero token cost
- ai flag with ambiguous input: {input: "j'ai un monorepo turborepo avec 3 apps"} → scripted wizard cannot resolve → agent invoked with current state context
- dashboard "Ask Jarvis" button clicked mid-step: {step: "configure-pipeline"} → agent invoked with the user's free-form question + current step context

### Agent tool invocations

- agent calls read tool: {tool: "get_setup_state"} → returns JSON of current step + completed steps, no confirmation needed
- agent calls write tool: {tool: "add_project", args: {path, platform}} → wizard surfaces confirmation prompt to user → user approves → tool executes
- agent calls unknown tool: {tool: "delete_everything"} → reject "Outil non autorisé"
- agent attempts file I/O outside MCP: {} → blocked at MCP server boundary

### Token budget

- session under cap: {tokens used: 30k, cap: 100k} → continue normally
- session approaching cap: {tokens used: 80k, cap: 100k} → warn agent in next system message "Token budget at 80%, conclude soon"
- cap reached: {tokens used: 100k} → terminate agent + emit SSE event "agent_handoff" + scripted wizard resumes

### Conversation lifecycle

- agent launched: {} → first message to user "Bonjour, je suis Jarvis. Vous semblez avoir un cas non-standard, expliquez-moi votre setup."
- agent answers question only: {user: "C'est quoi un agent ?"} → text response, no tool call, no state change
- agent guides through monorepo: {user: "j'ai 3 apps dans un monorepo"} → suggest "Je vais enregistrer les 3 apps comme projets séparés" + confirm + invoke add_project 3 times
- user cancels agent: {user: "stop"} → agent exits, scripted wizard resumes
- agent hits dead-end: {} → emit "agent_handoff" with reason + scripted wizard offers manual completion

### Multi-language interaction

- user writes French: {user: "j'ai un repo bizarre"} → agent responds French
- user writes English: {user: "I have a weird repo"} → agent responds English
- mixed language: {} → agent matches the user's last message language

### Failure modes

- claude --bg fails to launch: {claude binary not found} → reject "L'agent n'a pas pu démarrer, mode scripté forcé"
- MCP server unreachable: {socket: closed} → reject "Connexion MCP perdue, mode scripté repris"
- agent emits malformed tool call: {} → wizard logs error + responds to agent with structured error + retry capped at 3

## Out of Scope

- the agent doing code review work (it only handles setup; reviews are a separate agent system)
- voice or speech-to-text input to the agent
- the agent learning across sessions (each session is stateless)
- granting the agent shell access (it talks only to MCP tools)
- supporting models other than Claude (the agent is launched via `claude --bg`)
- automatic agent activation without user opt-in (always behind --ai flag or explicit button)
- billing or rate-limiting beyond the per-session token cap (handled by Claude Code's own subscription)

## Glossary

| Term | Definition |
|------|------------|
| Agent fallback | The Claude agent process invoked when scripted wizard cannot resolve an input |
| MCP tool surface | The set of structured tools exposed to the agent, each mapping to one of the SPEC-183 wizard steps |
| Token cap | The per-session maximum token budget for the agent (default 100k) |
| Agent handoff | The transition back from agent to scripted wizard, triggered by cap, dead-end, or user cancel |
| Sandboxed conversation | The agent's restricted execution environment: only MCP tools, no shell, no direct filesystem |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | WARN | Blocked by SPEC-183 fully shipped + feedback collected. Should not be implemented before then. |
| Negotiable | OK | Tool surface, token cap, prompt wording all negotiable. |
| Valuable | WARN | Value depends on real users hitting scripted-wizard dead-ends. Could be zero value if scripted flow already covers 99% of cases. |
| Estimable | WARN | Hard to estimate before knowing which dead-ends matter. Rough: 4-5 AI-days. |
| Small | OK | MCP server already exists in the project. New tools mirror SPEC-183 steps 1-to-1. Bounded surface. |
| Testable | OK | Agent behavior testable with recorded conversations + mock Claude responses. |

## Definition of Done

Standard checklist from `.claude/skills/product-manager/rules/dod.md` applies. Specific to this spec:

- [ ] **PREREQUISITE**: SPEC-183 has been live for at least 2 weeks with telemetry
- [ ] **PREREQUISITE**: At least 3 documented user friction points exist that the scripted wizard cannot solve
- [ ] MCP tool definitions for the 10 setup steps published
- [ ] Token tracking integrated with existing token usage tracking (SPEC-126/163)
- [ ] Agent prompt template authored and reviewed
- [ ] Acceptance test: agent invoked with monorepo input → correctly registers 3 projects
- [ ] Acceptance test: token cap reached → graceful handoff to scripted mode
- [ ] Cost telemetry: average token consumption per agent invocation logged
- [ ] User testing: 5 users with non-standard setups validate the agent guided flow successfully

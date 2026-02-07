---
title: Documentation Index
scope: index
last-updated: 2026-02-07
---

# Documentation Index

Centralized navigation for all claude-review-automation documentation.

## Quick Navigation

| Document | Scope | Description |
|----------|-------|-------------|
| [Quick Start](./QUICKSTART.md) | guide | Get up and running in minutes |
| [Configuration Reference](./CONFIG-REFERENCE.md) | reference | Server and project config schema |
| [Deployment Guide](./deployment/README.md) | guide | Production deployment with systemd, tunnels |
| [Troubleshooting](./TROUBLESHOOTING.md) | guide | Common issues and solutions |
| [Review Skills Guide](./REVIEW-SKILLS-GUIDE.md) | guide | How to create and customize review skills |
| [Markers Reference](./MARKERS-REFERENCE.md) | reference | Text marker syntax for progress and actions |
| [MCP Tools Reference](./MCP-TOOLS-REFERENCE.md) | reference | MCP tool parameters, examples, responses |
| [Technical Architecture](./ARCHITECTURE.md) | architecture | Current system architecture and file structure |
| [Target Architecture](./ARCHITECTURE-TARGET.md) | architecture | Clean Architecture migration target |
| [MCP Architecture](./mcp/MCP-ARCHITECTURE.md) | architecture | MCP server Clean Architecture design |
| [MCP Specification](./mcp/MCP-REVIEW-PROGRESS.md) | spec | MCP review progress specification and status |
| [Ubiquitous Language](./UBIQUITOUS-LANGUAGE.md) | reference | Domain terms, state machines, platform mapping |
| [Project Configuration](./PROJECT_CONFIG.md) | guide | Per-project `.claude/reviews/config.json` setup |
| [SPEC-003: Skill Templates](./specs/003-skill-templates.md) | spec | Generic skill template specification |

## Topic Clusters

### Getting Started

1. [Quick Start](./QUICKSTART.md) - Installation and first review
2. [Project Configuration](./PROJECT_CONFIG.md) - Configure your project
3. [Configuration Reference](./CONFIG-REFERENCE.md) - Full config schema
4. [Troubleshooting](./TROUBLESHOOTING.md) - When things go wrong

### Writing Review Skills

1. [Review Skills Guide](./REVIEW-SKILLS-GUIDE.md) - Skill structure and best practices
2. [Markers Reference](./MARKERS-REFERENCE.md) - Text markers for progress and actions
3. [MCP Tools Reference](./MCP-TOOLS-REFERENCE.md) - Structured MCP alternative to markers
4. [SPEC-003: Skill Templates](./specs/003-skill-templates.md) - Generic templates

### Architecture

1. [Technical Architecture](./ARCHITECTURE.md) - Current system overview
2. [Target Architecture](./ARCHITECTURE-TARGET.md) - Clean Architecture migration target
3. [Ubiquitous Language](./UBIQUITOUS-LANGUAGE.md) - Domain vocabulary and state machines

### MCP Server

1. [MCP Specification](./mcp/MCP-REVIEW-PROGRESS.md) - Problem, solution, integration
2. [MCP Architecture](./mcp/MCP-ARCHITECTURE.md) - Clean Architecture for MCP
3. [MCP Tools Reference](./MCP-TOOLS-REFERENCE.md) - Tool parameters and examples

### Operations

1. [Deployment Guide](./deployment/README.md) - systemd, tunnels, production setup
2. [Troubleshooting](./TROUBLESHOOTING.md) - Webhooks, services, Claude Code, MCP

## New Contributor Reading Path

Start here if you're new to the project:

1. **[Quick Start](./QUICKSTART.md)** - Understand the basics and run your first review
2. **[Ubiquitous Language](./UBIQUITOUS-LANGUAGE.md)** - Learn the domain vocabulary
3. **[Technical Architecture](./ARCHITECTURE.md)** - Understand the current system
4. **[Review Skills Guide](./REVIEW-SKILLS-GUIDE.md)** - Learn how skills work
5. **[Configuration Reference](./CONFIG-REFERENCE.md)** - Understand all configuration options

# Prompt Structure Rule

## 4 Mandatory Blocks

Every prompt should follow this structure:

### 1. Context — WHERE we are

- Feature / Module
- File(s) concerned
- References (docs, tickets, existing code)

### 2. Constraints — WHAT AI MUST NOT DO

- Don't modify X
- Tests must pass
- No new dependencies
- Stay within scope

### 3. Demand — WHAT AI MUST DO

ONE precise, atomic, verifiable action.

### 4. Format — EXPECTED OUTPUT

- Structure of the response
- Ending point (what "done" looks like)

## Templates

### New Component (TDD)

- **Context**: Feature, module, files
- **Constraints**: Don't modify existing code, tests must pass
- **Demand**: Create component with tests
- **Format**: RED first, GREEN minimal, test count

### Bug Fix

- **Context**: Bug description, file, expected vs actual behavior
- **Constraints**: One fix only, minimal change
- **Demand**: Diagnose and propose fix
- **Format**: Root cause, RED test reproducing bug, minimal fix

### Code Review

- **Context**: Files to review
- **Constraints**: Read-only, no modifications
- **Demand**: Read and identify issues
- **Format**: Positive points, severity-ordered remarks, summary

### Architecture Decision

- **Context**: Problem, affected modules
- **Constraints**: No code, 2+ options required
- **Demand**: Compare approaches
- **Format**: Comparative table, recommendation, decision is yours

## Rules

- One prompt = one demand
- Precise > short
- Checklist before sending

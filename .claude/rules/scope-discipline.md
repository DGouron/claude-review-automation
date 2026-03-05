# Scope Discipline Rule

## Principle

One change = one scope = one commit. NEVER modify code outside the request.

## Before Starting

1. **Define scope**: which files, which NOT to touch, expected result and nothing else
2. **Read before writing**: Open file, understand existing code and patterns, identify conventions, THEN modify
3. **Never write to a file you haven't read**

## During Code

### Strict Scope Rule

If not in demand, DON'T DO IT — even if it's:
- A "quick fix"
- "While we're at it"
- A bug you noticed
- Bad naming
- Unformatted code

### Finding Problems Out of Scope

1. **STOP** — don't fix
2. Signal with `file:line`
3. Ask "want me to fix separately?"
4. If yes → new scope, new change
5. If no → continue current work

### File Discipline

- One file at a time
- If 3+ files needed, propose staged breakdown

## After Code

### Scope Verification

- [ ] Modified only requested files?
- [ ] No out-of-scope changes?
- [ ] Diff contains only related changes?
- [ ] No bonus unrequested additions?

### Technical Verification

- [ ] `yarn verify` passes
- [ ] Types OK
- [ ] Lint OK
- [ ] Tests pass
- [ ] If code added, tests added

## One Change = One Commit

**Includes**: Code answering the demand + tests for that code

**Does NOT include**: Refactoring "on the way", found bugs, renaming, dependency updates, code cleanup

## Permissions

| Action | Permission |
|--------|-----------|
| Read any file | Allowed |
| List files/folders | Allowed |
| Run tests/types/lint | Allowed |
| Search code | Allowed |
| Modify out-of-scope files | Ask first |
| Install dependencies | Ask first |
| Delete code/files | Ask first |
| Modify config | Ask first |
| Change folder structure | Ask first |
| Irreversible operations | Ask first |

## Special Cases

- **"And also..."** → Two distinct scopes, do separately
- **Test breaks** → Is it testing modified behavior? YES = adapt (same scope). NO = signal (unrelated)
- **Existing code is bad** → Do the demand, signal it benefits from refactoring, propose separate scope
- **Destructive operations** → Verify in-scope, verify preconditions, signal BEFORE executing
- **Too big (>3 files)** → "I see N stages: [list], each = commit. Start?"

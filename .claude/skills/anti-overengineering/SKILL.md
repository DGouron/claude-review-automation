---
name: anti-overengineering
description: Guide anti-surengineering basé sur YAGNI. Utiliser avant d'ajouter un pattern architectural, lors de code review, ou pour challenger une implémentation trop complexe.
---

# Anti Over-Engineering Guidelines

## Persona

Read `.claude/roles/architect.md` — adopt this profile and follow all its rules.

## Activation

Ce skill s'active pour :
- Challenger une implémentation proposée
- Décider si un pattern DDD/Clean Architecture est justifié
- Review de code avec suspicion de surengineering
- Refactoring vers plus de simplicité

## Principe fondamental

> **"The best code is no code"** - Solve problems with the minimum viable complexity.

```
YAGNI (You Aren't Gonna Need It)
    ↓
Pragmatic Architecture
    ↓
Progressive Enhancement
```

---

## DDD Pattern Decision Matrix

### Quand appliquer les patterns

| Pattern | ✅ Apply When | ❌ Avoid When |
|---------|--------------|---------------|
| **Value Object** | Complex business rules, invariants to protect | Simple data structures, basic formatting |
| **Entity** | Identity-based objects with lifecycle | Stateless operations, simple data transfer |
| **Aggregate** | Complex transactional boundaries | Single entity operations, simple CRUD |
| **Service** | Stateless business logic, orchestration | Simple transformations, UI-only logic |
| **Repository** | Complex data access, multiple sources | Simple API calls, single gateway sufficient |
| **Use Case** | Business workflow orchestration | Single service calls, simple operations |

### Red Flags de surengineering

- Creating Value Objects for `{name: string, email: string}`
- Adding Repository when Gateway suffices
- Using Domain Events for basic state changes
- Creating Aggregates for single-entity operations
- Factory patterns for simple object creation
- Command/Query separation without complex logic

---

## Decision Tree

**Before adding any pattern, ask:**

```
1. Does current code fail to solve the problem?
   └─ No → Don't add complexity
   └─ Yes ↓

2. Is there actual business complexity?
   └─ No → Use simpler approach
   └─ Yes ↓

3. Will this pattern reduce overall complexity?
   └─ No → Find simpler solution
   └─ Yes ↓

4. Can you implement in <50 lines?
   └─ Yes → Start simple, refactor later
   └─ No → Pattern might be justified
```

---

## Complexity Thresholds

### Apply patterns ONLY IF:

1. **Business Logic Complexity** > Simple CRUD operations
2. **Multiple Business Rules** need coordination
3. **Cross-Entity Invariants** must be maintained
4. **Complex Validation** beyond basic type checking
5. **Workflow Orchestration** involves multiple steps/services

---

## Practical Examples

### ✅ Good Simplicity

```typescript
// Simple service - clear responsibility
class AddressSearchService {
  async searchAddresses(query: string): Promise<AddressType[]> {
    if (query.length < 3) return [];
    return await this.api.search(query);
  }
}
```

### ❌ Over-Engineering

```typescript
// Unnecessary complexity for simple operations
abstract class AbstractAddressSearchStrategy {
  abstract search(query: AddressQuery): Promise<AddressSearchResult>;
}

class GouvAddressSearchStrategy extends AbstractAddressSearchStrategy {
  // 50+ lines for simple API call
}

class AddressSearchFactory {
  createStrategy(type: SearchType): AbstractAddressSearchStrategy {
    // Complex factory for 2 simple options
  }
}
```

### ✅ Start Simple, Evolve

```typescript
// ❌ Over-engineered from start
class UserEmailValueObject {
  constructor(private email: string) {
    this.validateEmail();
  }
  getValue() { return this.email; }
}

// ✅ Start simple
type UserEmail = string;
const validateEmail = (email: string) => { /* validation */ };
```

---

## Checklist avant d'ajouter un pattern

- [ ] **Business Justification**: Does business complexity warrant this?
- [ ] **Team Understanding**: Can team easily understand and maintain?
- [ ] **Testing Impact**: Does this make testing easier or harder?
- [ ] **Future Flexibility**: Does this help or hinder future changes?
- [ ] **Code Ratio**: Is business logic > boilerplate code?

---

## When to Refactor

### TO patterns:
- Pain points emerge (hard to test, modify, understand)
- Business logic grows beyond simple functions
- Invariants need protection across operations
- Same logic reused in multiple places

### AWAY FROM patterns:
- Pattern used only once (no reusability)
- Boilerplate > Business logic
- Testing becomes harder
- Team confusion increases

---

## Remember

**"Architecture should scream the domain"** - But don't force patterns where simple functions suffice.

**"Refactor when it hurts"** - Don't prematurely optimize for imaginary future requirements.

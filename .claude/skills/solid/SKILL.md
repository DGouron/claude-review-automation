---
name: solid
description: SOLID Principles from Clean Architecture (Robert C. Martin). Use for code review, refactoring decisions, or when designing new modules/components.
---

# SOLID Principles - Clean Architecture Reference

> Based on "Clean Architecture" by Robert C. Martin, Chapter 7-11 (pages 57-90)

## Persona

Read `.claude/roles/architect.md` — adopt this profile and follow all its rules.

## When to Activate

This skill activates for:
- Code review with design concerns
- Refactoring decisions
- Designing new modules or components
- Evaluating class/function responsibilities

---

## SRP: Single Responsibility Principle

> **"A module should have one, and only one, reason to change."** — Clean Architecture, p.62

### Definition

A module should be responsible to one, and only one, actor (stakeholder/user group).

### In TypeScript/React

```typescript
// ❌ Bad: Multiple actors (CFO, COO, CTO all need changes here)
class Employee {
  calculatePay() { /* CFO's rules */ }
  reportHours() { /* COO's rules */ }
  save() { /* CTO's rules */ }
}

// ✅ Good: Separated by actor
class PayCalculator {
  calculate(employee: Employee): Money { /* CFO */ }
}

class HourReporter {
  report(employee: Employee): Report { /* COO */ }
}

class EmployeeRepository {
  save(employee: Employee): void { /* CTO */ }
}
```

### In React Components

```typescript
// ❌ Bad: Component handles display, business logic, AND API calls
function UserProfile() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(setUser);
  }, []);

  const calculateAge = () => { /* business logic */ };

  return <div>{user?.name} - {calculateAge()} years old</div>;
}

// ✅ Good: Separated concerns
// Presenter: business logic
function useUserProfilePresenter(user: User): UserProfileViewModel {
  return { displayName: user.name, age: calculateAge(user.birthdate) };
}

// View: display only (Humble Object)
function UserProfileView({ viewModel }: { viewModel: UserProfileViewModel }) {
  return <div>{viewModel.displayName} - {viewModel.age} years old</div>;
}

// Gateway: API calls
const userGateway = { fetch: () => api.get('/user') };
```

---

## OCP: Open-Closed Principle

> **"A software artifact should be open for extension but closed for modification."** — Clean Architecture, p.70

### Definition

You should be able to change the behavior of a module by adding new code, not changing existing code.

### In TypeScript

```typescript
// ❌ Bad: Must modify function to add new format
function formatOutput(data: Data, format: string): string {
  if (format === 'json') return JSON.stringify(data);
  if (format === 'xml') return toXml(data);
  if (format === 'csv') return toCsv(data); // Keep adding here...
}

// ✅ Good: Extend via interface
interface OutputFormatter {
  format(data: Data): string;
}

class JsonFormatter implements OutputFormatter {
  format(data: Data): string { return JSON.stringify(data); }
}

class XmlFormatter implements OutputFormatter {
  format(data: Data): string { return toXml(data); }
}

// Add new formats without modifying existing code
class CsvFormatter implements OutputFormatter {
  format(data: Data): string { return toCsv(data); }
}
```

### In React with Gateways

```typescript
// Gateway interface (open for extension)
interface IStudentGateway {
  getAll(): Promise<Student[]>;
  getById(id: string): Promise<Student>;
}

// Extend behavior by creating new implementations
class ApiStudentGateway implements IStudentGateway { /* real API */ }
class MockStudentGateway implements IStudentGateway { /* for tests */ }
class CachedStudentGateway implements IStudentGateway { /* with cache */ }
```

---

## LSP: Liskov Substitution Principle

> **"Subtypes must be substitutable for their base types."** — Clean Architecture, p.78

### Definition

If S is a subtype of T, objects of type T may be replaced with objects of type S without altering any desirable properties.

### In TypeScript

```typescript
// ❌ Bad: Square violates rectangle contract
class Rectangle {
  constructor(protected width: number, protected height: number) {}
  setWidth(w: number) { this.width = w; }
  setHeight(h: number) { this.height = h; }
  area() { return this.width * this.height; }
}

class Square extends Rectangle {
  setWidth(w: number) { this.width = this.height = w; } // Violates LSP!
  setHeight(h: number) { this.width = this.height = h; } // Violates LSP!
}

// Test that breaks:
const rect: Rectangle = new Square(5, 5);
rect.setWidth(10);
rect.setHeight(5);
console.log(rect.area()); // Expected 50, got 25!

// ✅ Good: Use composition or separate types
interface Shape {
  area(): number;
}

class Rectangle implements Shape {
  constructor(private width: number, private height: number) {}
  area() { return this.width * this.height; }
}

class Square implements Shape {
  constructor(private side: number) {}
  area() { return this.side * this.side; }
}
```

### In React/Redux

```typescript
// Gateway implementations must honor the contract
interface IFilterGateway {
  // Contract: MUST return filters for the given page, NEVER throw
  getFilters(page: PageFilterName): Promise<FiltersObject>;
}

// ✅ Good: All implementations honor the contract
class ApiFilterGateway implements IFilterGateway {
  async getFilters(page: PageFilterName): Promise<FiltersObject> {
    try {
      return await api.get(`/filters/${page}`);
    } catch {
      return {}; // Honor contract: return empty, don't throw
    }
  }
}

class StubFilterGateway implements IFilterGateway {
  async getFilters(page: PageFilterName): Promise<FiltersObject> {
    return { status: ['active'] }; // Honor contract
  }
}
```

---

## ISP: Interface Segregation Principle

> **"Don't depend on things you don't need."** — Clean Architecture, p.84

### Definition

Clients should not be forced to depend on methods they don't use. Many client-specific interfaces are better than one general-purpose interface.

### In TypeScript

```typescript
// ❌ Bad: Fat interface forces unused dependencies
interface IUserService {
  getUser(id: string): User;
  updateUser(user: User): void;
  deleteUser(id: string): void;
  sendEmail(userId: string, message: string): void;
  generateReport(userId: string): Report;
  syncWithCRM(userId: string): void;
}

// Component only needs getUser but depends on everything
function UserCard({ service }: { service: IUserService }) {
  const user = service.getUser('123');
  return <div>{user.name}</div>;
}

// ✅ Good: Segregated interfaces
interface IUserReader {
  getUser(id: string): User;
}

interface IUserWriter {
  updateUser(user: User): void;
  deleteUser(id: string): void;
}

interface IUserNotifier {
  sendEmail(userId: string, message: string): void;
}

// Component depends only on what it needs
function UserCard({ reader }: { reader: IUserReader }) {
  const user = reader.getUser('123');
  return <div>{user.name}</div>;
}
```

### In React Hooks

```typescript
// ❌ Bad: Hook returns everything
function useUser() {
  return {
    user, isLoading, error,
    updateUser, deleteUser, refreshUser,
    userPreferences, updatePreferences,
    userNotifications, markAsRead,
    // ... 20 more things
  };
}

// ✅ Good: Segregated hooks
function useUserProfile() {
  return { user, isLoading, error };
}

function useUserMutations() {
  return { updateUser, deleteUser };
}

function useUserNotifications() {
  return { notifications, markAsRead };
}
```

---

## DIP: Dependency Inversion Principle

> **"Depend on abstractions, not concretions."** — Clean Architecture, p.87

### Definition

High-level modules should not depend on low-level modules. Both should depend on abstractions.

### The Core Insight

> "The source code dependencies point in the opposite direction to the flow of control." — Clean Architecture, p.89

```
Flow of control:    UseCase → Gateway → API
Source dependency:  UseCase → Interface ← Gateway
```

### In TypeScript/Redux

```typescript
// ❌ Bad: Use case depends on concrete implementation
import { ApiStudentGateway } from './api-student.gateway'; // Concrete!

export const fetchStudents = createAsyncThunk(
  'students/fetch',
  async () => {
    const gateway = new ApiStudentGateway(); // Direct instantiation
    return gateway.getAll();
  }
);

// ✅ Good: Use case depends on abstraction (injected)
// 1. Define abstraction in domain/application layer
interface IStudentGateway {
  getAll(): Promise<Student[]>;
}

// 2. Implementation in infrastructure layer
class ApiStudentGateway implements IStudentGateway {
  async getAll(): Promise<Student[]> {
    return api.get('/students');
  }
}

// 3. Inject via Redux extraArgument
export const fetchStudents = createAsyncThunk(
  'students/fetch',
  async (_, { extra: { studentGateway } }) => {
    return studentGateway.getAll(); // Uses injected abstraction
  }
);

// 4. Wire up in store configuration
const store = configureStore({
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      thunk: {
        extraArgument: {
          studentGateway: new ApiStudentGateway(),
        }
      }
    })
});
```

### Dependency Direction in Clean Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frameworks                        │
│                   (React, Redux)                     │
├──────────────────────────┬──────────────────────────┤
│                          │                          │
│   ┌──────────────────────▼──────────────────────┐   │
│   │              Interface Adapters              │   │
│   │         (Controllers, Presenters,            │   │
│   │          Gateways implementations)           │   │
│   └──────────────────────┬──────────────────────┘   │
│                          │                          │
│   ┌──────────────────────▼──────────────────────┐   │
│   │              Application Layer               │   │
│   │    (Use Cases, Gateway interfaces)           │   │
│   └──────────────────────┬──────────────────────┘   │
│                          │                          │
│   ┌──────────────────────▼──────────────────────┐   │
│   │               Domain Layer                   │   │
│   │      (Entities, Business Rules)              │   │
│   └─────────────────────────────────────────────┘   │
│                                                      │
└──────────────────────────────────────────────────────┘

     ↑ Source code dependencies point INWARD
     ↓ Control flow can point either direction
```

---

## SOLID Checklist for Code Review

- [ ] **SRP**: Does this module have only one reason to change?
- [ ] **OCP**: Can I extend behavior without modifying existing code?
- [ ] **LSP**: Can all implementations be used interchangeably?
- [ ] **ISP**: Does this interface expose only what clients need?
- [ ] **DIP**: Do high-level modules depend on abstractions?

---

## Key Quotes from Clean Architecture

> "The SOLID principles tell us how to arrange our functions and data structures into classes, and how those classes should be interconnected." — p.58

> "The goal of the principles is the creation of mid-level software structures that: tolerate change, are easy to understand, and are the basis of components that can be used in many software systems." — p.58

> "Violating OCP is the most common way of creating fragile designs." — p.71

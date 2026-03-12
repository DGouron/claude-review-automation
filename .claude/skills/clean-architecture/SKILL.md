---
name: architecture
description: Guide Clean Architecture (Uncle Bob) pour ce projet. Utiliser pour créer module, entité, use case, presenter, controller, gateway, guard, service, view model. Contient les patterns tactiques et conventions de structure.
---

# Clean Architecture - Guide Tactique

## Persona

Read `.claude/roles/architect.md` — adopt this profile and follow all its rules.

## Activation

Ce skill s'active pour toute création ou modification de composants architecturaux :
- Entities, Use Cases, Presenters
- Controllers, Gateways, Guards
- ViewModels, Services
- Structure de modules

## Principe fondamental

> "The architecture should scream the intent of the system." — Uncle Bob

```
┌─────────────────────────────────────┐
│       Interface Adapters            │  ← Controllers, Presenters, Gateways, Views
├─────────────────────────────────────┤
│           Use Cases                 │  ← Application Business Rules
├─────────────────────────────────────┤
│            Entities                 │  ← Enterprise Business Rules
└─────────────────────────────────────┘
```

**Dependency Rule** : Les dépendances pointent vers l'intérieur. Le domaine ne connaît pas l'infrastructure.

---

## Structure d'un module

```
modules/<bounded-context>/
├── entities/
│   └── <entity>/
│       ├── <entity>.ts              # Entité + logique métier
│       ├── <entity>.schema.ts       # Zod schema
│       ├── <entity>.guard.ts        # Validation aux frontières
│       └── <entity>.gateway.ts      # Interface (port)
├── use-cases/
│   └── <action>-<entity>.usecase.ts
├── interface-adapters/
│   ├── controllers/
│   │   └── <feature>.controller.ts
│   ├── presenters/
│   │   └── <feature>.presenter.ts
│   ├── gateways/
│   │   └── <entity>.in-<source>.gateway.ts
│   ├── views/
│   │   └── <feature>.view.tsx       # Humble object
│   └── services/
│       └── <service>.service.ts
└── testing/
    ├── good-path/
    │   └── stub.<entity>.gateway.ts
    └── bad-path/
        └── failing.<entity>.gateway.ts
```

---

## Composants

### Entity

Logique métier pure, indépendante de tout framework.

```typescript
// entities/quest/quest.ts
export class Quest {
  private constructor(private readonly props: QuestProps) {}

  static create(props: QuestProps): Quest {
    return new Quest(props)
  }

  get title(): string {
    return this.props.title
  }

  complete(rating: number): QuestCompletion {
    // Logique métier ici
  }
}
```

### Use Case

Orchestration d'une action métier. Un use case = une intention utilisateur.

```typescript
// use-cases/complete-quest.usecase.ts
export const completeQuest = (questId: string, rating: number) =>
  async (dispatch: AppDispatch, getState: AppGetState, dependencies: Dependencies) => {
    const quest = await dependencies.questGateway.getById(questId)
    const completion = quest.complete(rating)
    await dependencies.questGateway.saveCompletion(completion)
    dispatch(questCompleted(completion))
  }
```

### Presenter

Transforme les données métier en ViewModel. Contient TOUTE la logique de présentation.

```typescript
// interface-adapters/presenters/quest-list.presenter.ts
export class QuestListPresenter {
  present(quests: Quest[]): QuestListViewModel {
    return {
      quests: quests.map(quest => ({
        identifier: quest.identifier,
        title: quest.title,
        statusLabel: this.formatStatus(quest.status),
        statusColor: this.getStatusColor(quest.status),
      })),
      isEmpty: quests.length === 0,
      emptyMessage: "Aucune quête disponible",
    }
  }
}
```

### ViewModel

Structure de données simple. Strings formatés, booleans UI. Défini avec Zod.

```typescript
// interface-adapters/presenters/quest-list.view-model.ts
export const questListViewModelSchema = z.object({
  quests: z.array(z.object({
    identifier: z.string(),
    title: z.string(),
    statusLabel: z.string(),
    statusColor: z.string(),
  })),
  isEmpty: z.boolean(),
  emptyMessage: z.string(),
})

export type QuestListViewModel = z.infer<typeof questListViewModelSchema>
```

### View (Humble Object)

Zéro logique. Affiche le ViewModel. Pas de tests React.

```typescript
// interface-adapters/views/quest-list.view.tsx
export function QuestListView({ viewModel }: { viewModel: QuestListViewModel }) {
  if (viewModel.isEmpty) {
    return <p>{viewModel.emptyMessage}</p>
  }
  return (
    <ul>
      {viewModel.quests.map(quest => (
        <li key={quest.identifier} style={{ color: quest.statusColor }}>
          {quest.title} - {quest.statusLabel}
        </li>
      ))}
    </ul>
  )
}
```

### Controller

Orchestre Use Case + Presenter. Point d'entrée pour une action.

```typescript
// interface-adapters/controllers/quest-list.controller.ts
export class QuestListController {
  constructor(
    private readonly presenter: QuestListPresenter,
    private readonly dispatch: AppDispatch,
  ) {}

  async load(): Promise<QuestListViewModel> {
    await this.dispatch(getQuests())
    const quests = selectQuests(store.getState())
    return this.presenter.present(quests)
  }
}
```

### Gateway

Interface (port) dans entities, implémentation dans interface-adapters.

```typescript
// entities/quest/quest.gateway.ts (CONTRAT)
export interface QuestGateway {
  getAll(): Promise<Quest[]>
  getById(identifier: string): Promise<Quest>
  save(quest: Quest): Promise<void>
}

// interface-adapters/gateways/quest.in-local-storage.gateway.ts (IMPL)
export class QuestInLocalStorageGateway implements QuestGateway {
  async getAll(): Promise<Quest[]> {
    const data = localStorage.getItem('quests')
    return parseQuestCollection(JSON.parse(data ?? '[]'))
  }
}
```

### Guard

Validation aux frontières avec Zod.

```typescript
// entities/quest/quest.guard.ts
export function isValidQuest(data: unknown): data is QuestProps {
  return questSchema.safeParse(data).success
}

export function parseQuest(data: unknown): QuestProps {
  return questSchema.parse(data)
}

export function safeParseQuest(data: unknown): SafeParseReturnType<unknown, QuestProps> {
  return questSchema.safeParse(data)
}

export function parseQuestCollection(data: unknown): QuestProps[] {
  return z.array(questSchema).parse(data)
}
```

### Service

Utilitaires injectés via Dependencies.

| Scope | Emplacement |
|-------|-------------|
| Cross-contextes | `shared/services/` |
| Spécifique BC | `modules/<context>/interface-adapters/services/` |

---

## Injection de dépendances

Via Redux Toolkit `extraArgument`. Voir [references.md](references.md) pour les détails.

```typescript
// shared/dependencies.ts
export interface Dependencies {
  questGateway: QuestGateway
  uuidService: UuidService
}

// Usage dans Use Case
const quests = await dependencies.questGateway.getAll()
```

---

## Test doubles

```
testing/
├── good-path/
│   └── stub.quest.gateway.ts    # Happy path
└── bad-path/
    └── failing.quest.gateway.ts # Error scenarios
```

Voir [examples.md](examples.md) pour des exemples concrets.

---

## Anti-patterns à éviter

- ❌ Logique métier dans les Views
- ❌ Logique de présentation dans les Use Cases
- ❌ Entités qui connaissent l'infrastructure
- ❌ Dépendances qui pointent vers l'extérieur
- ❌ Tests React pour les Views (Humble Object Pattern)

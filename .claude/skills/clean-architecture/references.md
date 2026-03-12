# Références Clean Architecture

Sources : *Clean Architecture* (Robert C. Martin, 2017)

---

## Chapitres clés

| Chapitre | Concept | Application projet |
|----------|---------|-------------------|
| Ch. 20 | Business Rules | Entities dans `entities/` |
| Ch. 21 | Screaming Architecture | Structure `modules/<context>/` |
| Ch. 22 | The Clean Architecture | Couches concentriques |
| Ch. 23 | Presenters & Humble Objects | Séparation Presenter/View |
| Ch. 26 | The Main Component | `dependencies.ts` |

---

## The Dependency Rule (Ch. 22)

> "Source code dependencies must point only inward, toward higher-level policies."

```
Entities ← Use Cases ← Interface Adapters ← Frameworks
```

**Conséquence** : Une Entity ne doit jamais importer depuis `interface-adapters/`.

---

## Humble Object Pattern (Ch. 23, p. 212-213)

Sépare le code testable du code difficile à tester.

| Composant | Testable | Logique |
|-----------|----------|---------|
| Presenter | ✅ Oui | Transformation données → ViewModel |
| View | ❌ Non (humble) | Affichage pur du ViewModel |

**Règle** : Si tu écris un `if` dans une View, il devrait être dans le Presenter.

---

## Use Cases (Ch. 20-21)

> "Use cases contain application-specific business rules."

Un Use Case :
- Représente UNE intention utilisateur
- Orchestre les Entities
- Ne connaît pas l'UI

**Naming** : `<verbe>-<entity>.usecase.ts`
- `complete-quest.usecase.ts`
- `assign-quest.usecase.ts`

---

## Boundaries & Gateways (Ch. 22)

Les Gateways implémentent l'inversion de dépendance.

```
Use Case → Gateway Interface (dans entities/)
                ↑
Gateway Implementation (dans interface-adapters/)
```

Le Use Case dépend de l'abstraction, pas de l'implémentation.

---

## The Main Component (Ch. 26)

> "Main is the dirtiest component in the system."

Le composant `main` (ou `dependencies.ts`) :
- Instancie les implémentations concrètes
- Configure l'injection de dépendances
- Est le seul à connaître les détails d'infrastructure

```typescript
// shared/dependencies.ts - The "dirty" component
export const createDependencies = (): Dependencies => ({
  questGateway: new QuestInLocalStorageGateway(),
  uuidService: new CryptoUuidService(),
})
```

---

## Entity vs Use Case

| Aspect | Entity | Use Case |
|--------|--------|----------|
| Portée | Enterprise-wide | Application-specific |
| Dépendances | Aucune externe | Entities + Gateways |
| Exemple | `Quest.complete()` | `completeQuest()` qui sauvegarde |

---

## Screaming Architecture (Ch. 21)

> "Your architecture should tell readers about the system, not about the frameworks."

La structure de dossiers crie l'intention métier :

```
✅ modules/family-quests/     → On comprend le domaine
❌ src/components/            → On ne comprend que le framework
```

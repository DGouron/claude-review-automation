---
name: tdd
description: Guide interactif pour le TDD Detroit School. Utiliser dès que l'utilisateur demande d'écrire ou modifier du code - nouvelle feature, bug fix, debug, refactoring, modification. Active un workflow RED-GREEN-REFACTOR avec validation à chaque étape.
---

# TDD Interactive Guide - Detroit School

## Persona

Read `.claude/roles/senior-dev.md` — adopt this profile and follow all its rules.

## Philosophie Detroit School

**State-based testing** : On teste le résultat observable, pas les interactions internes.

| Principe | Explication |
|----------|-------------|
| **Tester l'état** | Vérifier le résultat final, pas comment on y arrive |
| **Inside-Out** | Commencer par le domaine, remonter vers l'extérieur |
| **Mocks minimaux** | Uniquement pour les I/O externes (gateways, API, DB) |
| **Tests robustes** | Résistants au refactoring interne |

**Quand mocker :**
- ✅ Gateways (API, base de données, fichiers)
- ✅ Services externes (email, paiement)
- ❌ Logique métier interne
- ❌ Collaborations entre objets du domaine

```typescript
// ✅ Detroit : on teste l'état final
it("should add item to cart", () => {
  const cart = new Cart()
  cart.add(product)

  expect(cart.items).toContain(product)
  expect(cart.total).toBe(10)
})

// ❌ London : on teste les interactions (à éviter)
it("should call inventory.reserve", () => {
  const inventory = mock<Inventory>()
  cart.add(product)
  expect(inventory.reserve).toHaveBeenCalled()
})
```

**Exemple Solife** (test réel du projet) :

```typescript
// modules/__test__/domain/membership/usecases/submitMembershipForm.test.ts
describe("submitMembershipForm", () => {
  let mockFormData: IMembershipFormData;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFormData = createDefaultMembershipFormData();
    mockFormData.candidateIdentity.firstName = "John";
    mockFormData.candidateIdentity.lastName = "Doe";
  });

  // ✅ Detroit : on teste l'ÉTAT du résultat
  it("should submit form data successfully", async () => {
    mockFetchJson({ ok: true, jsonData: { message: "Succès" } });

    const result = await submitMembershipForm(mockFormData);

    expect(result.success).toBe(true);  // État final
  });

  // ✅ Validation avant soumission
  it("should validate form data before submission", async () => {
    const invalidData = {} as IMembershipFormData;

    const result = await submitMembershipForm(invalidData);

    expect(global.fetch).not.toHaveBeenCalled();  // Side-effect vérifiable
    expect(result.success).toBe(false);           // État final
  });
});
```

---

## Manifeste TDD

Le TDD respecte ces principes fondamentaux :

| Principe | Signification |
|----------|---------------|
| **Baby steps** | Petits pas pour feedback rapide et régulier |
| **Continuous refactoring** | On améliore maintenant, pas "plus tard" |
| **Evolutionary design** | On développe le nécessaire et suffisant |
| **Executable documentation** | Les tests SONT la documentation vivante |
| **Minimalist code** | Simple et fonctionnel > surdimensionné |

## Principe du test minimal

> "The simplest thing that could possibly work." — Kent Beck

> "As the tests get more specific, the code gets more generic." — Robert C. Martin

**Règles :**
1. **Un seul comportement par test**
2. **Du naïf au complet** : cas simple d'abord, edge cases après
3. **Pas d'anticipation** : un cycle à la fois

**Progression type :**
```
Cycle 1: "should create a completion" (cas nominal)
Cycle 2: "should have a rating" (propriété)
Cycle 3: "should reject rating below 1" (validation)
Cycle 4: "should reject rating above 5" (validation)
```

**Anti-pattern :**
```typescript
// ❌ Test trop large
it("should validate a completion with rating 1-5 and ISO datetime", () => {
  // teste rating min, max, format date, cas nominal...
})

// ✅ Un comportement par test
it("should create a completion", () => { ... })
it("should reject rating below 1", () => { ... })
```

---

## Activation

Ce skill s'active dès que l'utilisateur demande de toucher au code :
- Nouvelles features : "Implémente...", "Ajoute...", "Crée..."
- Bug fixes : "Corrige...", "Fix...", "Répare..."
- Debug : "Pourquoi ça...", "Ça ne marche pas..."
- Modifications : "Modifie...", "Change...", "Met à jour..."
- Refactoring : "Refactor...", "Améliore...", "Nettoie..."

---

## Workflow obligatoire

À chaque cycle, suivre ces 3 phases avec **arrêt et validation utilisateur** entre chaque.

### 🔴 Phase RED

**Objectif** : Écrire UN test qui échoue

**Actions** :
1. Annoncer : "RED: Je vais tester [comportement précis]"
2. Identifier le plus petit test possible (baby step)
3. Proposer le test SANS l'écrire
4. Attendre validation
5. Écrire le test après validation
6. Exécuter `yarn test:run` pour confirmer l'échec
7. Demander : "Le test échoue comme attendu. On passe en GREEN ?"

**Template :**
```
🔴 RED - Proposition de test

Comportement à tester : [description]
Fichier : [path]

Test proposé :
[code du test - state-based, vérifie le résultat]

Ce test vérifie que [explication de l'état attendu].
On valide ce test ?
```

---

### 🟢 Phase GREEN

**Objectif** : Faire passer le test avec le code MINIMAL

**Actions** :
1. Annoncer : "GREEN: Je vais faire passer le test avec le minimum de code"
2. Proposer l'implémentation minimale SANS l'écrire
3. Attendre validation
4. Écrire le code après validation
5. Exécuter `yarn test:run` pour confirmer le succès
6. Demander : "Le test passe. On refactor ou prochain cycle ?"

**Règles** :
- Code MINIMAL qui fait passer le test
- Pas d'optimisation prématurée
- Valeurs en dur acceptées si suffisantes

**Template :**
```
🟢 GREEN - Proposition d'implémentation

Pour faire passer le test, je propose :
[code minimal]

C'est volontairement minimal car [explication].
On valide cette implémentation ?
```

---

### 🔵 Phase REFACTOR

**Objectif** : Simplifier sans changer le comportement

**Principes** :
- **KISS** : La solution la plus simple
- **YAGNI** : Supprimer ce qui n'est pas nécessaire
- **DRY** : Factoriser uniquement si duplication réelle

**Actions** :
1. Annoncer : "REFACTOR: Analyse des opportunités de simplification"
2. Chercher : code mort, abstractions prématurées, complexité accidentelle
3. Proposer les refactorings un par un
4. Attendre validation pour chaque
5. Exécuter `yarn test:run` après chaque refactoring
6. Demander : "Refactor terminé. Prochain cycle RED ?"

**Ordre de priorité** : Supprimer > Simplifier > Réorganiser

**Template :**
```
🔵 REFACTOR - Analyse

Code smells détectés :
- [smell 1] : [explication]

Refactoring proposé :
[description du changement]

On applique ce refactoring ?
```

---

## Cas particulier : Debug / Bug Fix

1. **Comprendre** : Comportement attendu vs actuel
2. **RED** : Test qui reproduit le bug (doit échouer)
3. **GREEN** : Corriger pour que le test passe
4. **REFACTOR** : Nettoyer si nécessaire

Le test devient une régression protectrice.

---

## Checkpoints obligatoires

Jamais passer à la phase suivante sans :
- ✅ Validation explicite de l'utilisateur
- ✅ Tests exécutés et résultat conforme

## Specs et tickets : pas de code prédéterminé

Le TDD repose sur la **découverte progressive du design**. Les specs/tickets ne doivent PAS contenir :

| Interdit | Pourquoi |
|----------|----------|
| Noms de tests | Le test émerge du besoin, pas l'inverse |
| Noms de fichiers | L'architecture se révèle par itération |
| Signatures de méthodes | Le design naît du code le plus simple |
| Commandes d'installation | Les dépendances viennent quand nécessaire |

**Principe** : On ne prédit pas le code final. On procède par baby steps, de l'implémentation la plus naïve au cas final.

```
❌ Ticket avec "Tests à implémenter : should_create_user_with_email"
❌ Ticket avec "Fichiers : src/services/user.service.ts"
❌ Ticket avec "Méthode : createUser(email: string): User"

✅ Ticket avec critères Gherkin décrivant le COMPORTEMENT attendu
```

Le cycle RED-GREEN-REFACTOR fait émerger le design. Le ticket décrit le QUOI (comportement), pas le COMMENT (implémentation).

---

## Anti-patterns à bloquer

- ❌ Code prod sans test rouge
- ❌ Plusieurs tests d'un coup
- ❌ Implémenter plus que nécessaire en GREEN
- ❌ Refactorer sans tests verts
- ❌ Passer une phase sans validation
- ❌ Mocker la logique métier interne
- ❌ Prédéterminer le code dans les specs/tickets

---

## Fin de cycle

```
📊 Cycle terminé

Tests ajoutés : [nombre]
Comportements couverts : [liste]
Prochain comportement suggéré : [suggestion]

On continue ?
```

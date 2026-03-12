---
name: refactoring-mikado-strangler
description: Guide pour les refactorings de grande envergure avec Mikado et Strangler Fig. Utiliser pour migration d'architecture, remplacement de librairie, découpage de modules, changement de patterns. Maintient un graph Mikado pour tracker les dépendances.
---

# Refactoring Large Scale - Mikado & Strangler Fig

## Persona

Read `.claude/roles/senior-dev.md` — adopt this profile and follow all its rules.

## Activation

Ce skill s'active pour les refactorings qui dépassent le scope d'un cycle TDD :
- Migration d'architecture
- Remplacement de librairie ou framework
- Découpage d'un module monolithique
- Changement de pattern (ex: callbacks → promises → async/await)
- Restructuration de bounded contexts

## Choix de la méthode

| Critère | Mikado | Strangler Fig |
|---------|--------|---------------|
| Ancien code reste fonctionnel pendant | ❌ Non | ✅ Oui |
| Besoin de livrer incrémentalement | ❌ Difficile | ✅ Idéal |
| Dépendances complexes à démêler | ✅ Idéal | ⚠️ Possible |
| Remplacement complet d'un système | ⚠️ Possible | ✅ Idéal |

**Demander à l'utilisateur** quelle méthode utiliser si ce n'est pas évident.

---

## 🌳 Méthode Mikado

### Principe

1. **Essayer** l'objectif final directement
2. **Observer** ce qui casse
3. **Revert** immédiatement (pas de code cassé qui traîne)
4. **Noter** les pré-requis découverts dans le graph
5. **Récurser** sur chaque pré-requis
6. **Implémenter** les feuilles du graph (celles sans dépendances)

### Workflow interactif

#### Étape 1 : Initialisation

```
🌳 MIKADO - Initialisation

Objectif principal : [description]
Fichier graph : docs/mikado/[nom]-graph.md

Je vais créer le fichier de tracking.
On commence ?
```

Créer le fichier graph :
```markdown
# Mikado Graph: [Objectif]

## Statut: EN COURS

## Objectif principal
- [ ] [Description de l'objectif]

## Pré-requis découverts
(Se remplit au fur et à mesure des tentatives)

## Historique des tentatives
(Log des essais et découvertes)
```

#### Étape 2 : Tentative

```
🌳 MIKADO - Tentative

Je vais essayer : [objectif ou pré-requis]
Attente : [ce qui devrait casser]

On tente ?
```

Après validation :
1. Tenter la modification
2. Exécuter `yarn test:run`
3. Noter TOUT ce qui casse
4. **REVERT IMMÉDIATEMENT** avec `git checkout .`

#### Étape 3 : Analyse

```
🌳 MIKADO - Analyse

Tentative : [ce qu'on a essayé]
Résultat : [succès / échec]

Erreurs rencontrées :
- [erreur 1] → Pré-requis : [action nécessaire]
- [erreur 2] → Pré-requis : [action nécessaire]

Je mets à jour le graph.
On traite quel pré-requis en premier ?
```

#### Étape 4 : Implémentation (feuilles)

Quand un pré-requis n'a pas de dépendance :
```
🌳 MIKADO - Implémentation

Pré-requis à implémenter : [description]
C'est une feuille du graph (pas de dépendance).

→ Activation du skill TDD pour implémenter proprement.
```

**Basculer sur le skill TDD** pour implémenter le pré-requis avec RED-GREEN-REFACTOR.

#### Étape 5 : Validation

Après chaque implémentation :
```
🌳 MIKADO - Validation

Pré-requis complété : [description]
Je mets à jour le graph : ✅

Prochaine action :
- [ ] [Autre feuille à traiter]
- [ ] [Retenter un objectif parent]

On continue avec quoi ?
```

---

## 🌿 Méthode Strangler Fig

### Principe

1. **Créer** le nouveau système à côté de l'ancien
2. **Migrer** progressivement les appels vers le nouveau
3. **Cohabitation** : les deux systèmes fonctionnent en parallèle
4. **Supprimer** l'ancien quand plus rien ne l'utilise

### Workflow interactif

#### Étape 1 : Planification

```
🌿 STRANGLER - Planification

Ancien système : [description]
Nouveau système : [description]

Points d'entrée à migrer :
1. [point 1]
2. [point 2]
...

Je crée le fichier de tracking : docs/strangler/[nom]-migration.md
On commence par quel point d'entrée ?
```

Créer le fichier de tracking :
```markdown
# Strangler Migration: [Nom]

## Statut: EN COURS

## Ancien système
- Localisation : [path]
- Points d'entrée : [liste]

## Nouveau système
- Localisation : [path]
- Points d'entrée migrés : 0/[total]

## Plan de migration

| Point d'entrée | Statut | Date |
|----------------|--------|------|
| [point 1] | ⏳ En attente | - |
| [point 2] | ⏳ En attente | - |

## Checklist suppression ancien système
- [ ] Tous les points d'entrée migrés
- [ ] Aucune référence à l'ancien code
- [ ] Tests de l'ancien système supprimés/migrés
- [ ] Ancien code supprimé
```

#### Étape 2 : Création du nouveau

```
🌿 STRANGLER - Nouveau système

Je vais créer la nouvelle implémentation pour : [point d'entrée]
Localisation : [path]

→ Activation du skill TDD pour implémenter proprement.
```

**Basculer sur le skill TDD** pour créer la nouvelle implémentation.

#### Étape 3 : Migration d'un point d'entrée

```
🌿 STRANGLER - Migration

Point d'entrée : [description]
Ancien : [code/path]
Nouveau : [code/path]

Plan de migration :
1. [étape 1]
2. [étape 2]

On migre ?
```

#### Étape 4 : Vérification cohabitation

```
🌿 STRANGLER - Vérification

Migration effectuée : [point d'entrée]

Checklist :
- [ ] Tests passent
- [ ] Ancien code toujours fonctionnel (si d'autres dépendances)
- [ ] Nouveau code utilisé par [consommateurs]

Je mets à jour le tracking.
Prochain point d'entrée ?
```

#### Étape 5 : Suppression

Quand tous les points d'entrée sont migrés :
```
🌿 STRANGLER - Suppression

Tous les points d'entrée sont migrés ! 🎉

Ancien code à supprimer :
- [fichier 1]
- [fichier 2]

Tests à supprimer/migrer :
- [test 1]

On nettoie ?
```

---

## Intégration avec le skill TDD

Chaque fois qu'on doit **implémenter** du code (pré-requis Mikado ou nouveau système Strangler), on bascule sur le skill TDD :

```
→ Ce pré-requis nécessite du code.
→ Activation du skill TDD pour implémenter avec RED-GREEN-REFACTOR.
→ Retour au skill Refactoring une fois terminé.
```

---

## Fichiers de tracking

Les graphs et plans sont stockés dans :
```
docs/
├── mikado/
│   └── [nom]-graph.md
└── strangler/
    └── [nom]-migration.md
```

Ces fichiers servent de documentation vivante et permettent de reprendre un refactoring interrompu.

---

## Anti-patterns à bloquer

- ❌ Laisser du code cassé non-reverté (Mikado)
- ❌ Supprimer l'ancien avant que le nouveau soit complet (Strangler)
- ❌ Implémenter sans tests (toujours passer par le skill TDD)
- ❌ Plusieurs refactorings en parallèle
- ❌ Passer une étape sans validation utilisateur

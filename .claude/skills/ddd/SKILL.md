---
name: ddd
description: Guide DDD stratégique pour ce projet. Utiliser pour découper le domaine en bounded contexts, définir l'ubiquitous language, créer un nouveau module métier, analyser les frontières entre contextes. Les patterns tactiques suivent Clean Architecture (voir skill architecture).
---

# Domain-Driven Design - Guide Stratégique

## Persona

Read `.claude/roles/architect.md` — adopt this profile and follow all its rules.

## Activation

Ce skill s'active pour les décisions de haut niveau sur le domaine :
- Découpage en Bounded Contexts
- Définition de l'Ubiquitous Language
- Création d'un nouveau module métier
- Analyse des relations entre contextes

## Clarification importante

> **Les définitions Clean Architecture priment sur les définitions DDD tactique.**

On utilise DDD uniquement au niveau **stratégique** (découpage domaine, langage). Les patterns tactiques (Entities, Use Cases, Gateways, Presenters) suivent **Clean Architecture**.

| Ce qu'on prend du DDD | Ce qu'on NE prend PAS |
|-----------------------|-----------------------|
| Bounded Contexts | Aggregates |
| Ubiquitous Language | Repositories (on a Gateways) |
| Context Mapping | Domain Events |
| Découpage modules | Value Objects complexes |

---

## Bounded Context

> "A Bounded Context delimits the applicability of a particular model." — Eric Evans

Un Bounded Context = un module dans `modules/<context-name>/`

Chaque BC est un **package autonome** avec sa propre API publique.

### Identifier un Bounded Context

**Signes qu'un nouveau BC est nécessaire :**
- Un même terme a des significations différentes selon le contexte
- Une équipe différente pourrait gérer cette partie
- Le modèle devient trop complexe
- Les règles métier divergent

**Exemple Solife :**

| Bounded Context | Responsabilité |
|-----------------|----------------|
| `membership` | Gestion des adhésions et candidatures |
| `spamDetection` | Détection anti-spam et modération |
| `documents` | Gestion documentaire et téléchargements |
| `payment` | Paiements Stripe et dons |
| `email` | Communications et templates emails |
| `support` | Formulaires de soutien (bénévolat, matériel) |

---

## Communication entre Bounded Contexts

Les BC communiquent **via leurs APIs publiques**, comme deux packages indépendants.

```typescript
// modules/spamDetection/index.ts (API publique)
export { ValidateSubmissionUseCase } from "./application/usecases/ValidateSubmissionUseCase"
export { createSpamFlag } from "./domain/factories/spamFlagFactory"
export type { ISpamScoringService } from "./application/ports/services/ISpamScoringService"

// modules/membership/ importe depuis l'API publique
import { ValidateSubmissionUseCase } from "@/modules/spamDetection"
```

### Règles de communication

| ✅ Autorisé | ❌ Interdit |
|-------------|-------------|
| Importer depuis `index.ts` d'un autre BC | Importer directement un fichier interne |
| Passer des données (DTO, primitifs) | Partager des entités mutables |
| Appeler un Use Case exposé | Accéder au state interne |

### Exemple concret

```typescript
// modules/membership/application/usecases/submitMembershipForm.ts
import { ValidateSubmissionUseCase } from "@/modules/spamDetection"  // ✅ API publique

export const submitMembershipForm = async (data) => {
  const spamCheck = new ValidateSubmissionUseCase(spamService);
  // ...
}
```

```typescript
// ❌ INTERDIT - import interne
import { analyzeSpamIndicators } from "@/modules/spamDetection/domain/validators/nameSpamValidator"
```

---

## Ubiquitous Language

> "Use the model as the backbone of a language." — Eric Evans

Le vocabulaire métier doit être :
- **Cohérent** : même terme = même concept dans un contexte donné
- **Explicite** : pas d'ambiguïté
- **Partagé** : compris par devs ET métier

### Dans le code

```typescript
// ✅ Ubiquitous Language respecté
class Member { ... }
class SpamFlag { ... }
function validateSubmission() { ... }
function createMembership() { ... }

// ❌ Vocabulaire technique ou ambigu
class User { ... }           // "User" n'est pas le terme métier (on dit "Member")
class MembershipRequest { }  // "Request" vs "Candidature" ?
function checkSpam() { }     // "check" vs "validate" ?
```

### Documentation du langage

Chaque BC maintient son glossaire dans `/docs/business/glossary/<context>.md`

```markdown
# Glossaire - Membership

| Terme | Définition |
|-------|------------|
| Member | Une personne adhérente à l'association |
| Candidature | Demande d'adhésion en attente de validation |
| SpamFlag | Marqueur de soumission suspecte (anti-spam) |
| Donation | Don financier à l'association |
```

---

## Workflow : Créer un nouveau Bounded Context

### Étape 1 : Identifier le domaine

```
🎯 DDD - Identification

Nouveau domaine identifié : [nom]

Questions à valider :
1. Quel problème métier résout-il ?
2. Quels sont les termes spécifiques ?
3. Quelles entités principales ?
4. Quels BC existants vont l'utiliser ?

On explore ces questions ?
```

### Étape 2 : Définir le langage

```
📖 DDD - Ubiquitous Language

Glossaire proposé pour [context] :

| Terme | Définition |
|-------|------------|
| ... | ... |

Ces termes sont-ils alignés avec le vocabulaire métier ?
```

### Étape 3 : Définir l'API publique

```
📡 DDD - API Publique

Exports prévus pour [context] :

Entities : [liste]
Use Cases : [liste]
Types : [liste]

Quels autres BC consommeront cette API ?
```

### Étape 4 : Créer la structure

```
📁 DDD - Structure

Je vais créer :
modules/[context]/
├── index.ts           # API publique
├── entities/
├── use-cases/
├── interface-adapters/
└── testing/

+ Glossaire : docs/business/glossary/[context].md

On crée cette structure ?
```

Après validation → **Basculer sur le skill Architecture** pour les détails tactiques.

---

## Anti-patterns à éviter

- ❌ Un seul gros module "domain" fourre-tout
- ❌ Mélanger les vocabulaires de plusieurs contextes
- ❌ Dépendances circulaires entre contextes
- ❌ Importer les fichiers internes d'un autre BC
- ❌ Nommer les modules par aspect technique ("services", "models")

---

## Références

- *Domain-Driven Design* (Eric Evans, 2003) - Chapitres 1-4 (stratégique)
- Pour les patterns tactiques → voir skill **architecture** (Clean Architecture)

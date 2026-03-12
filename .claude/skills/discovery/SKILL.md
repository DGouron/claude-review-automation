---
name: discovery
description: Discovery business avant les specs techniques. Utiliser pour explorer un problème, définir des personas, clarifier la proposition de valeur. Produit Lean Canvas, Personas et Problem Statements dans /docs/business/.
---

# Discovery - Exploration business

## Persona

Read `.claude/roles/specifier.md` — adopt this profile and follow all its rules.

## Philosophie

La discovery vient AVANT les specs. On explore :
- **Le problème** — pas la solution
- **Les utilisateurs** — leurs douleurs, pas leurs demandes
- **La valeur** — le bénéfice, pas la feature

> "Fall in love with the problem, not the solution." — Uri Levine

---

## Activation

Ce skill s'active quand l'utilisateur veut explorer :
- "Je veux explorer...", "C'est quoi le problème qu'on résout ?"
- "Qui sont les utilisateurs ?", "Discovery sur..."
- "Quelle est la proposition de valeur ?"
- "Lean canvas pour...", "Persona de..."

---

## Artefacts produits

| Artefact | Fichier | Quand l'utiliser |
|----------|---------|------------------|
| **Problem Statement** | `docs/business/problems/<nom>.md` | Définir précisément le problème |
| **Persona** | `docs/business/personas/<nom>.md` | Comprendre qui a le problème |
| **Lean Canvas** | `docs/business/canvas/<nom>.md` | Vue d'ensemble d'une opportunité |

---

## Workflow

### Point d'entrée

```
🔍 DISCOVERY - Démarrage

Tu veux explorer : [sujet]

Par quoi on commence ?
1. 💢 Problem Statement — Quel problème exactement ?
2. 👤 Persona — Qui a ce problème ?
3. 📋 Lean Canvas — Vue d'ensemble de l'opportunité ?

Choisis ton point d'entrée, ou dis-moi ce que tu sais déjà.
```

---

## Problem Statement

### Dialogue de construction

```
💢 PROBLEM STATEMENT - Exploration

Je vois : [description vague du problème]

Creusons :
1. Qui exactement a ce problème ?
2. Quand/où se manifeste-t-il ?
3. Que font-ils aujourd'hui pour le contourner ?
4. Quelle est la conséquence si on ne le résout pas ?

Réponds à ce qui te parle, on itère.
```

### Template de sortie

Fichier : `docs/business/problems/<nom>.md`

```markdown
# Problem Statement : [Titre explicite]

## Le problème

[Persona] rencontre [problème] quand [contexte/déclencheur].

Aujourd'hui, [persona] [comportement actuel / workaround].

Cela cause [conséquence négative] et [impact mesurable].

## Fréquence et sévérité

| Dimension | Évaluation |
|-----------|------------|
| Fréquence | [quotidien/hebdo/mensuel/ponctuel] |
| Sévérité | [bloquant/gênant/irritant] |
| Population touchée | [estimation] |

## Hypothèses à valider

- [ ] [Hypothèse sur l'existence du problème]
- [ ] [Hypothèse sur la fréquence]
- [ ] [Hypothèse sur l'impact]

## Ce qui n'est PAS le problème

- [Fausse piste 1 — pourquoi c'est une fausse piste]
- [Fausse piste 2]

## Questions de recherche

- [Question ouverte à explorer]
```

---

## Persona

### Dialogue de construction

```
👤 PERSONA - Construction

Je vais te poser des questions pour définir ce persona.

1. C'est qui cette personne ? (rôle, contexte, environnement)
2. Qu'est-ce qu'elle essaie d'accomplir ? (objectifs)
3. Qu'est-ce qui la frustre aujourd'hui ? (pain points)
4. Comment gère-t-elle le problème actuellement ? (workarounds)

Commence par me décrire cette personne comme si tu me la présentais.
```

### Template de sortie

Fichier : `docs/business/personas/<nom>.md`

```markdown
# Persona : [Nom descriptif]

## Identité

| Attribut | Description |
|----------|-------------|
| Rôle | [rôle dans le contexte d'usage] |
| Contexte | [environnement, contraintes, ressources] |
| Expérience | [niveau d'expertise sur le sujet] |

## Objectifs (Goals)

Ce que cette personne veut accomplir :

1. **[Objectif principal]** — [pourquoi c'est important pour elle]
2. **[Objectif secondaire]** — [pourquoi c'est important]

## Frustrations (Pain Points)

Ce qui la bloque ou l'irrite aujourd'hui :

1. **[Frustration 1]** — Impact : [conséquence concrète]
2. **[Frustration 2]** — Impact : [conséquence concrète]

## Comportements actuels

Comment elle gère le problème aujourd'hui :

- [Workaround 1] — [limites de cette solution]
- [Workaround 2] — [limites]

## Citation typique

> "[Une phrase que cette personne dirait, qui capture son état d'esprit]"

## Critères de succès

Comment sait-elle que son problème est résolu ?

- [Critère mesurable 1]
- [Critère mesurable 2]

## Anti-persona

Ce persona n'est PAS :
- [Profil à ne pas confondre — pourquoi]
```

---

## Lean Canvas

### Dialogue de construction

```
📋 LEAN CANVAS - Construction

On va construire le canvas bloc par bloc.

Commençons par le plus important :
1. C'est quoi le problème principal ? (pas 10, juste 1-3)
2. Pour qui ? (segment prioritaire)

Une fois qu'on a ça, on continue avec la proposition de valeur.
```

### Template de sortie

Fichier : `docs/business/canvas/<nom>.md`

```markdown
# Lean Canvas : [Nom du produit/feature]

## 1. Problème

Les 3 problèmes principaux :

1. **[Problème 1]**
2. **[Problème 2]**
3. **[Problème 3]**

### Alternatives existantes

Comment les utilisateurs résolvent ces problèmes aujourd'hui :

- [Solution actuelle 1] — [limites]
- [Solution actuelle 2] — [limites]

---

## 2. Segments utilisateurs

| Segment | Caractéristiques | Priorité |
|---------|------------------|----------|
| Early Adopters | [qui va adopter en premier et pourquoi] | 🎯 |
| Marché principal | [qui représente le volume] | ⏳ |

---

## 3. Proposition de valeur unique

> [Une phrase qui explique pourquoi c'est différent et pourquoi ça vaut le coup]

### High-Level Concept

"C'est comme [analogie connue] pour [contexte spécifique]"

---

## 4. Solution

Les 3 fonctionnalités clés :

| Feature | Résout |
|---------|--------|
| [Feature 1] | Problème 1 |
| [Feature 2] | Problème 2 |
| [Feature 3] | Problème 3 |

---

## 5. Canaux

Comment atteindre les utilisateurs :

- **Acquisition** : [comment ils découvrent]
- **Activation** : [comment ils commencent à utiliser]
- **Rétention** : [comment ils reviennent]

---

## 6. Flux de revenus

- [Source de revenu 1] — [modèle : abo, one-shot, freemium...]
- [Source de revenu 2]

---

## 7. Structure de coûts

| Type | Coût | Récurrence |
|------|------|------------|
| [Coût fixe] | [montant] | [mensuel/annuel] |
| [Coût variable] | [montant/unité] | [par usage] |

---

## 8. Métriques clés

| Métrique | Objectif | Pourquoi cette métrique |
|----------|----------|-------------------------|
| [Métrique 1] | [cible] | [ce qu'elle mesure] |
| [Métrique 2] | [cible] | [ce qu'elle mesure] |

---

## 9. Avantage compétitif

Ce qui ne peut pas être facilement copié :

- [Avantage 1] — [pourquoi c'est défendable]
- [Avantage 2]

---

## Hypothèses à valider

| Hypothèse | Risque si fausse | Comment valider | Statut |
|-----------|------------------|-----------------|--------|
| [Hypothèse 1] | [impact] | [méthode] | ⏳ |
| [Hypothèse 2] | [impact] | [méthode] | ⏳ |
```

---

## Anti-patterns à bloquer

| Anti-pattern | Exemple | Réaction |
|--------------|---------|----------|
| Sauter aux solutions | "On va faire une app mobile" | Revenir au problème |
| Persona générique | "Les utilisateurs veulent..." | Demander qui exactement |
| Problème sans impact | "C'est pas optimal" | Demander la conséquence |
| Canvas sans hypothèses | "On sait que..." | Challenger les certitudes |
| Confusion demande/besoin | "Ils veulent un bouton" | Creuser le pourquoi |

---

## Exemples de challenges

**Demande** : "On veut faire une fonctionnalité de gamification"

```
🔍 DISCOVERY - Challenge

"Gamification" c'est une solution, pas un problème.

Questions :
1. Quel comportement utilisateur veux-tu encourager ?
2. Pourquoi les utilisateurs ne le font pas naturellement ?
3. Comment sais-tu que la gamification va marcher ?

On revient au problème avant de parler solution.
```

**Demande** : "Nos utilisateurs veulent un export Excel"

```
🔍 DISCOVERY - Challenge

Attention : ce que les utilisateurs demandent ≠ ce dont ils ont besoin.

Questions :
1. Qu'est-ce qu'ils font avec cet Excel une fois exporté ?
2. Si on leur donnait directement ce résultat final, ça marcherait ?
3. Qui demande ça exactement ? (persona)

Peut-être que le vrai besoin c'est un dashboard, pas un export.
```

---

## Intégration avec autres skills

Après la discovery :
- `/pm` pour transformer les insights en specs actionables
- `/ddd` si un nouveau bounded context émerge

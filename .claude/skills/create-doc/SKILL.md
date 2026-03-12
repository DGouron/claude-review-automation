---
name: create-doc
description: Create a new documentation file following project standards. Detects overlap with existing docs before creating.
---

# Create Documentation

## Activation

Ce skill s'active pour :
- Créer un nouveau fichier de documentation
- Documenter une feature, un concept, ou un composant
- `/create-doc`

## Persona

Read `.claude/roles/documentalist.md` — adopt this profile and follow all its rules.

## Workflow

### Étape 1 : Clarifier le sujet

Si le sujet est vague, demander :
- Quel composant/feature documenter ?
- Public cible : contributeur, utilisateur, LLM ?
- Scope : `reference`, `guide`, `architecture`, ou `spec` ?

### Étape 2 : Détecter les doublons

**OBLIGATOIRE** avant toute création.

```bash
# Lister tous les docs existants
Glob docs/**/*.md

# Lire les titres et H2/H3 de chaque fichier
# Comparer avec le sujet demandé
```

**Si un doc existant couvre déjà le sujet** :
- STOP — ne pas créer de nouveau fichier
- Proposer de mettre à jour le doc existant via `/update-docs`
- Expliquer quel fichier couvre quoi

**Si chevauchement partiel** :
- Identifier précisément quelles sections existent déjà
- Le nouveau doc ne doit couvrir QUE le contenu manquant
- Ajouter des liens vers les sections existantes

### Étape 3 : Créer le fichier

Appliquer le template de `PERSONA.md` :

```yaml
---
title: <Title>
scope: reference | guide | architecture | spec
related:
  - src/path/to/source.ts
  - docs/RELATED-DOC.md
last-updated: YYYY-MM-DD
---
```

**Règles d'écriture** :
- Anglais uniquement
- 1-2 phrases de résumé après le titre
- Une section = un concept
- Tables plutôt que listes pour les données structurées
- Code blocks plutôt que prose pour les détails techniques
- Max 800 mots — splitter si plus long

### Étape 4 : Nommage

| Emplacement | Convention |
|-------------|-----------|
| `docs/` top-level | `SCREAMING-KEBAB.md` (ex: `MCP-TOOLS-REFERENCE.md`) |
| Sous-dossier | `kebab-case.md` (ex: `docs/mcp/architecture.md`) |

### Étape 5 : Mettre à jour l'index

Exécuter `/docs-index` pour régénérer `docs/INDEX.md` avec le nouveau fichier.

## Anti-patterns

| Interdit | Faire plutôt |
|----------|-------------|
| Dupliquer du contenu existant | Linker vers la source canonique |
| Doc > 800 mots | Splitter en plusieurs fichiers |
| Sections sans rapport avec le titre | Créer un doc séparé |
| Prose quand un tableau suffit | Utiliser un tableau |
| Mélanger français et anglais | Tout en anglais |

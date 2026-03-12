---
name: docs-index
description: Generate or update the centralized documentation index (docs/INDEX.md) with navigation map and cross-references.
---

# Documentation Index Generator

## Activation

Ce skill s'active pour :
- Générer ou regénérer `docs/INDEX.md`
- Mettre à jour l'index après ajout/suppression de docs
- `/docs-index`

## Persona

Read `.claude/roles/documentalist.md` — adopt this profile and follow all its rules.

## Workflow

### Étape 1 : Scanner les docs

```bash
Glob docs/**/*.md
```

Pour chaque fichier :
- Lire le frontmatter (`title`, `scope`, `last-updated`)
- Lire le premier paragraphe (résumé)
- Si pas de frontmatter : utiliser le H1 comme titre, noter "no frontmatter"

### Étape 2 : Générer l'index

**Toujours régénérer depuis zéro** — ne jamais patcher un index existant.

Structure cible de `docs/INDEX.md` :

```markdown
---
title: Documentation Index
scope: reference
last-updated: YYYY-MM-DD
---

# Documentation Index

## Quick Navigation

| Document | Scope | Summary | Updated |
|----------|-------|---------|---------|
| [QUICKSTART](./QUICKSTART.md) | guide | 5-minute setup | YYYY-MM-DD |
| [ARCHITECTURE](./ARCHITECTURE.md) | architecture | System overview | YYYY-MM-DD |
| ... | ... | ... | ... |

## By Topic

### Getting Started
1. [QUICKSTART](./QUICKSTART.md)
2. [CONFIG-REFERENCE](./CONFIG-REFERENCE.md)
3. [PROJECT_CONFIG](./PROJECT_CONFIG.md)

### Architecture
- [ARCHITECTURE](./ARCHITECTURE.md)
- [UBIQUITOUS-LANGUAGE](./UBIQUITOUS-LANGUAGE.md)

### MCP Protocol
- [MCP-TOOLS-REFERENCE](./MCP-TOOLS-REFERENCE.md)

### Review System
- [REVIEW-SKILLS-GUIDE](./REVIEW-SKILLS-GUIDE.md)

### Deployment
- [DEPLOYMENT](./DEPLOYMENT.md)

## New Contributor Path

Read in this order:
1. QUICKSTART → 2. ARCHITECTURE → 3. UBIQUITOUS-LANGUAGE → 4. CONFIG-REFERENCE
```

### Étape 3 : Vérifier les liens

Pour chaque lien dans l'index, vérifier que le fichier cible existe.
Reporter les liens cassés comme erreurs.

## Règles

- L'index NE CONTIENT PAS de contenu documentaire — uniquement des liens et résumés d'une phrase
- Les résumés sont extraits des docs, jamais inventés
- Les topics sont regroupés par proximité thématique, pas par ordre alphabétique
- Le "New Contributor Path" est un parcours de lecture ordonné, pas une simple liste
- Fichiers sans frontmatter : afficher un warning `⚠ no frontmatter` dans la colonne Updated

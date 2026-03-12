---
name: update-docs
description: Update documentation after code changes. Scans git diff to find affected docs and updates them for consistency.
---

# Update Documentation

## Activation

Ce skill s'active pour :
- Mettre à jour la doc après un changement de code
- Synchroniser la documentation avec l'état actuel du code
- `/update-docs`

## Persona

Read `.claude/roles/documentalist.md` — adopt this profile and follow all its rules.

## Workflow

### Étape 1 : Identifier les changements de code

```bash
# Par défaut : 5 derniers commits. L'utilisateur peut spécifier une range.
git diff --name-only HEAD~5
```

Filtrer les fichiers pertinents (ignorer : tests, configs, lock files).

### Étape 2 : Mapper changements → docs

Deux stratégies, dans cet ordre :

**Stratégie A — Frontmatter `related`** (prioritaire) :
```bash
# Lire le frontmatter de chaque doc
Glob docs/**/*.md
# Chercher les fichiers modifiés dans le champ `related`
```

**Stratégie B — Recherche par mots-clés** (fallback) :
- Extraire les noms d'entités/modules des fichiers modifiés
- Chercher ces termes dans le contenu des docs
- Ex: si `mcpServerStdio.ts` a changé, chercher "mcp", "server", "stdio" dans les docs

### Étape 3 : Évaluer l'impact

Pour chaque doc potentiellement affecté :

| Question | Si oui |
|----------|--------|
| Le comportement documenté a changé ? | Mise à jour requise |
| Une API/interface documentée a changé ? | Mise à jour requise |
| Seule l'implémentation interne a changé ? | Pas de mise à jour |
| Un nouveau concept est apparu ? | Proposer `/create-doc` |

### Étape 4 : Mettre à jour

Pour chaque doc à modifier :

1. Lire le doc entier et le code source modifié
2. Mettre à jour **uniquement** les sections affectées
3. Ne JAMAIS ajouter de contenu qui existe dans un autre doc — linker
4. Mettre à jour `last-updated` dans le frontmatter
5. Vérifier que les `related` sont à jour (ajouter les nouveaux fichiers si besoin)

### Étape 5 : Ajouter le frontmatter manquant

Si un doc n'a pas de frontmatter YAML, l'ajouter en respectant le template de `PERSONA.md`.
C'est une migration progressive — pas besoin de tout faire d'un coup.

### Étape 6 : Rapport

Lister les modifications effectuées :

```
## Docs Updated

| File | Changes | Reason |
|------|---------|--------|
| docs/MCP-TOOLS-REFERENCE.md | Updated tool parameters | mcpServerStdio.ts changed |
| docs/ARCHITECTURE.md | No update needed | Internal refactor only |
```

## Règles

- Ne pas traduire les docs French existantes sauf demande explicite
- Ne pas restructurer un doc entier — modifier uniquement ce qui est affecté
- Si un doc est massivement obsolète, recommander `/audit-docs` d'abord
- Toujours garder la structure existante sauf si elle viole le template

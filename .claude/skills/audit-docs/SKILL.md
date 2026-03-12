---
name: audit-docs
description: Audit documentation for duplication, staleness, language issues, and verbosity. Read-only — produces an actionable report.
---

# Audit Documentation

## Activation

Ce skill s'active pour :
- Vérifier la qualité de la documentation
- Détecter les doublons, docs obsolètes, incohérences
- `/audit-docs`

## Persona

Read `.claude/roles/documentalist.md` — adopt this profile and follow all its rules.

## Mode

**READ-ONLY.** Ce skill analyse et rapporte. Il ne modifie aucun fichier.

## Workflow — 5 passes d'audit

### Pass 1 : Inventaire

```bash
Glob docs/**/*.md
Glob templates/**/*.md
```

Pour chaque fichier, extraire :
- Titre (H1 ou frontmatter `title`)
- Frontmatter présent ? (oui/non)
- Headings H2/H3
- Langue détectée
- Nombre de mots approximatif

Produire un tableau d'inventaire.

### Pass 2 : Détection de doublons

Comparer les headings H2/H3 entre toutes les paires de fichiers :

1. **Chevauchement de titres** : si deux docs partagent > 40% de leurs H2/H3, les flagger
2. **Contenu similaire** : pour les paires flaggées, comparer les 100 premiers mots de chaque section
3. **Marqueurs dupliqués** : chercher les définitions de concepts (ex: `THREAD_RESOLVE`, phase names) qui apparaissent dans plusieurs fichiers

**Problèmes connus à détecter** :
- `DEPLOYMENT.md` vs `deployment/README.md` — quasi-identiques
- `PROJECT_CONFIG.md` vs `CONFIG-REFERENCE.md` — chevauchement config projet
- Markers documentés dans 5+ fichiers
- Troubleshooting dupliqué dans 3+ fichiers

### Pass 3 : Détection d'obsolescence

1. Vérifier `last-updated` dans le frontmatter (si présent)
2. Pour chaque fichier `related` dans le frontmatter :
   ```bash
   git log -1 --format=%ci <related-file>
   ```
   Si le source est plus récent que `last-updated`, flagger comme potentiellement obsolète
3. Vérifier les chemins référencés dans le doc — s'ils existent encore :
   ```bash
   # Pour chaque chemin src/... mentionné dans le doc
   ls <path>
   ```
4. Chercher les références à des concepts/APIs qui n'existent plus

### Pass 4 : Cohérence linguistique

Détecter le français dans chaque fichier. Indicateurs :
- Mots fréquents : "les", "des", "une", "est", "dans", "pour", "avec", "cette", "qui", "sur"
- Phrases entières en français
- Titres en français

**Règle** : toute la documentation doit être en anglais.

### Pass 5 : Analyse de verbosité

| Seuil | Action |
|-------|--------|
| Section > 500 mots | Suggérer condensation ou split |
| Document > 800 mots | Suggérer split en plusieurs docs |
| Phrases fillers détectées | Lister avec localisation |

Phrases fillers à détecter :
- "it should be noted that", "it is important to mention"
- "as you can see", "as mentioned above/below"
- "in order to" (→ "to"), "due to the fact that" (→ "because")
- "at the end of the day", "going forward"

## Format du rapport

```markdown
# Documentation Audit Report

## Summary

| Metric | Count |
|--------|-------|
| Total docs scanned | X |
| Duplication issues | X |
| Stale docs | X |
| Language issues | X |
| Verbosity issues | X |
| Missing frontmatter | X |

## Duplication Issues

### DUPL-001: [Doc A] ↔ [Doc B]
- **Topic**: [overlapping topic]
- **Severity**: high | medium | low
- **Overlapping sections**: [list]
- **Action**: Consolidate into [file], link from [other file]

## Stale Documentation

### STALE-001: [Doc]
- **Last updated**: [date or "no frontmatter"]
- **Source changed**: [file] on [date]
- **Action**: Update [specific sections]

## Language Issues

### LANG-001: [Doc]
- **Language**: French (should be English)
- **Action**: Translate to English

## Verbosity Issues

### VERB-001: [Doc] — [Section]
- **Word count**: X (target: < 300)
- **Fillers found**: [list]
- **Action**: Condense

## Recommended Actions (Priority Order)

1. [Highest impact action]
2. [...]
```

## Après l'audit

Recommander les skills appropriés :
- Doublons → `/update-docs` pour consolider
- Nouveau doc nécessaire → `/create-doc`
- Index manquant/obsolète → `/docs-index`

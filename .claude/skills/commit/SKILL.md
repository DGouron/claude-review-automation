---
name: commit
description: Commit et push sécurisé. Crée un commit conforme aux conventions et push. Husky se charge des vérifications (TypeScript, Biome, tests).
---

# Commit - Workflow Git sécurisé

## Persona

Read `.claude/roles/senior-dev.md` — adopt this profile and follow all its rules.

## Activation

Ce skill s'active :
- Sur demande explicite (`/commit`)
- Quand l'utilisateur demande de committer/pusher du code

## Hooks Husky (automatiques)

Le projet utilise Husky qui exécute automatiquement :

| Hook | Action |
|------|--------|
| `pre-commit` | TypeScript check + Biome lint (fichiers modifiés) |
| `commit-msg` | commitlint (format du message) |
| `pre-push` | Tests vitest (fichiers modifiés depuis `test`) |

**Pas besoin de lancer `yarn verify` manuellement !**

## Workflow

### Étape 1 : Analyse des changements

```bash
git status --short
```

Si rien n'est staged, proposer :
```bash
git add <fichiers>
```

### Étape 1.5 : Vérification backend (si fichiers backend modifiés)

Si des fichiers dans `backend/` sont modifiés ou staged, exécuter PHPStan :

```bash
cd backend && ./vendor/bin/phpstan analyse --level=max
```

**Si PHPStan échoue** : corriger les erreurs avant de continuer. Erreurs courantes :
| Erreur | Solution |
|--------|----------|
| `empty() is not allowed` | Utiliser `=== []` ou `=== ''` |
| `Cannot cast mixed to X` | Ajouter `/** @var type */` ou typer les closures |
| `getDQLPart returns mixed` | Ajouter `/** @var array<...> */` avant la variable |
| `Match arm always true` | Supprimer le `default` si tous les cas sont couverts |

### Étape 2 : Création du commit

#### Format du message (Conventional Commits)

```
<type>(<scope>): <description>
```

**Types autorisés** :
| Type | Usage |
|------|-------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `docs` | Documentation uniquement |
| `style` | Formatage (pas de changement de code) |
| `refactor` | Refactoring (pas de nouvelle feature ni fix) |
| `perf` | Amélioration de performance |
| `test` | Ajout ou correction de tests |
| `build` | Changements du système de build |
| `ci` | Changements CI/CD |
| `chore` | Maintenance, dépendances |
| `revert` | Revert d'un commit précédent |

**Règles** :
- Header max **72 caractères**
- Description en minuscules, sans point final
- Scope optionnel entre parenthèses

#### Exemples

```
feat(cvboard): add isInitialized flag to fix race condition
fix(auth): resolve token refresh loop
refactor(companies): extract reload logic to hook
test(filters): add unit tests for filter presenter
```

### Étape 3 : Commit

```bash
git commit -m "<type>(<scope>): <description>"
```

Husky exécutera automatiquement :
1. TypeScript check
2. Biome lint
3. commitlint

### Étape 4 : Push (optionnel)

```bash
git push origin <current-branch>
```

Husky exécutera automatiquement les tests avant le push.

## Règles de sécurité

- **JAMAIS** de `--force` sans demande explicite
- **JAMAIS** de push sur `main` ou `test` directement
- **JAMAIS** de `--no-verify` sauf demande explicite de l'utilisateur
- **TOUJOURS** vérifier qu'on est sur une feature branch
- **JAMAIS** de mention de Claude, Anthropic, ou Co-Authored-By dans les commits

## Si Husky échoue

| Erreur | Solution |
|--------|----------|
| TypeScript | Corriger les erreurs de type |
| Biome | `yarn fix` pour auto-corriger |
| commitlint | Reformuler le message de commit |
| Tests (push) | Corriger les tests qui échouent |

## Template de sortie

```
📦 COMMIT

Branche : <branch>
Fichiers staged :
  - <fichier 1>
  - <fichier 2>

Message : <type>(<scope>): <description>

Vérifications :
  - Husky (frontend) : TypeScript ✓ Biome ✓ commitlint ✓
  - Backend (si modifié) : PHPStan ✓

Confirmer commit ? (oui/non)
```

## Monorepo : Frontend + Backend

Ce projet est un monorepo avec :
- `/frontend/` : React + TypeScript (vérifié par Husky)
- `/backend/` : Symfony + PHP (vérifié manuellement par PHPStan)

**IMPORTANT** : Husky ne vérifie que le frontend. Si des fichiers backend sont modifiés, lancer PHPStan manuellement AVANT de commit :

```bash
cd backend && ./vendor/bin/phpstan analyse --level=max
```

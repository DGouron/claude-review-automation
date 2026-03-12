---
name: security
description: Scan du code pour détecter les secrets avant commit. Utiliser avant git add/commit/push ou sur demande. Vérifie tokens, API keys, credentials, et autres données sensibles.
---

# Security - Détection de secrets

## Persona

Read `.claude/roles/code-reviewer.md` — adopt this profile and follow all its rules.

## Activation

Ce skill s'active :
- Avant un `git commit` ou `git push`
- Sur demande explicite (`/security`)
- Via la commande CLI `flux security-scan` (scan repo complet)

## Patterns détectés

### Tokens & API Keys

| Pattern | Exemple | Regex |
|---------|---------|-------|
| GitLab PAT | `glpat-xxxx` | `glpat-[a-zA-Z0-9_-]{20,}` |
| GitHub PAT | `ghp_xxxx` | `gh[ps]_[a-zA-Z0-9]{36,}` |
| GitHub OAuth | `gho_xxxx` | `gho_[a-zA-Z0-9]{36,}` |
| OpenAI | `sk-xxxx` | `sk-[a-zA-Z0-9]{32,}` |
| Anthropic | `sk-ant-xxxx` | `sk-ant-[a-zA-Z0-9-]{32,}` |
| AWS Access Key | `AKIA...` | `AKIA[0-9A-Z]{16}` |
| AWS Secret | - | `[a-zA-Z0-9/+=]{40}` (contexte AWS) |
| Slack Token | `xox[baprs]-` | `xox[baprs]-[a-zA-Z0-9-]+` |
| Discord Token | - | `[MN][a-zA-Z0-9]{23,}\.[a-zA-Z0-9-_]{6}\.[a-zA-Z0-9-_]{27}` |

### Credentials génériques

| Pattern | Contexte |
|---------|----------|
| `password\s*=\s*["'][^"']+["']` | Mots de passe en dur |
| `secret\s*=\s*["'][^"']+["']` | Secrets en dur |
| `token\s*=\s*["'][^"']+["']` | Tokens en dur |
| `api[_-]?key\s*=\s*["'][^"']+["']` | Clés API en dur |
| `Bearer [a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+` | JWT tokens |

### Fichiers suspects

| Fichier | Risque |
|---------|--------|
| `.env` | Variables d'environnement (souvent secrets) |
| `*.pem`, `*.key` | Clés privées |
| `secrets.*`, `credentials.*` | Fichiers de secrets |
| `config.toml` avec section `[secrets]` | Config avec secrets intégrés |
| `id_rsa`, `id_ed25519` | Clés SSH privées |

## Workflow

### Scan avant commit (git diff --staged)

```
🔒 SECURITY - Scan pre-commit

Analyse du diff staged...

Résultat :
- Fichiers scannés : X
- Secrets détectés : Y

[Si secrets trouvés]
⚠️ ALERTE : Secrets détectés !

Fichier : src/config.rs
Ligne 42 : token = "glpat-..." (GitLab PAT)

Action : Corriger avant de commit.
Suggestions :
- Utiliser une variable d'environnement
- Déplacer dans ~/.config/flux/secrets.toml
```

### Scan repo complet (flux security-scan)

```
🔒 SECURITY - Scan complet

Scan de tout le repository...

Résultat :
- Fichiers scannés : X
- Fichiers ignorés (.gitignore) : Y
- Secrets détectés : Z

[Liste des fichiers avec secrets]
```

## Commandes

### Git diff staged

```bash
git diff --cached --name-only  # Liste des fichiers staged
git diff --cached              # Contenu du diff
```

### Scan patterns

```bash
# Exemple avec grep (le skill utilise des outils plus avancés)
git diff --cached | grep -E "(glpat-|ghp_|sk-|password\s*=)"
```

## Faux positifs

Ignorer si :
- Dans un fichier de test avec des valeurs factices (`test_token`, `fake_key`)
- Dans la documentation (exemples avec `xxxx` ou `your-token-here`)
- Pattern dans un commentaire expliquant le format attendu

## Intégration CLAUDE.md

Ce skill applique la règle de sécurité :
> **Règle absolue** : Jamais de token, clé API, ou secret en clair dans le code ou les fichiers versionnés.

## Rapport

Le scan produit un rapport avec :
1. Statut global (✅ OK / ⚠️ ALERTE)
2. Nombre de fichiers scannés
3. Liste des secrets détectés (fichier, ligne, type)
4. Suggestions de correction

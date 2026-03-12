---
name: worktree
description: Gestion des worktrees Git pour travailler sur plusieurs branches en parallèle. Créer, lister, supprimer et synchroniser les worktrees. Protège contre les push directs sur master.
---

# Commande /worktree - Gestion des worktrees Git

Gère les worktrees Git pour travailler sur plusieurs branches en parallèle dans différentes sessions Claude Code.

## Règles de sécurité ABSOLUES

```
🚨 JAMAIS de push direct sur `master` !
🚨 JAMAIS de commit direct sur `master` !
✅ Seule action autorisée sur `master` : git pull origin master
✅ Toujours créer une PR pour merger vers `master`
```

---

## Configuration

| Paramètre | Valeur |
|-----------|--------|
| Dossier worktrees | `.claude/worktrees/` |
| Branche principale | `master` |
| Branche par défaut pour `--from` | `master` |

---

## Sous-commandes

### `/worktree` ou `/worktree list`
Liste tous les worktrees existants avec leur branche et statut.

### `/worktree add <nom> [--from <branche>]`
Crée un nouveau worktree avec une branche "home-base".
- Par défaut, basé sur `master`
- Chemin : `.claude/worktrees/<nom>`

### `/worktree remove <nom>`
Supprime un worktree (demande confirmation si non propre).

### `/worktree sync [nom]`
Synchronise le worktree avec `master` (pull only).

### `/worktree connect <nom>`
Change le répertoire de travail de la session actuelle vers le worktree spécifié.
- Vérifie que le worktree existe
- Se positionne dans `<chemin_worktree>`
- Affiche le statut git du worktree

---

## Architecture des worktrees

```
claude-review-automation/             ← Worktree principal (master)
├── src/
├── .claude/
│   └── worktrees/
│       ├── refactor/                 ← Worktree refactor
│       │   ├── src/
│       │   └── ...
│       ├── debug/                    ← Worktree debug
│       │   ├── src/
│       │   └── ...
│       └── feature-x/               ← Worktree feature
│           ├── src/
│           └── ...
└── ...
```

---

## Concept : Branches "Home-Base"

Chaque worktree a une branche "home-base" qui sert de point de départ.

| Branche | Rôle |
|---------|------|
| `refactor`, `debug`, etc. | Home-base du worktree (synchro avec `master`) |
| `feat/xxx-*`, `fix/xxx-*` | Branches de travail |

**Workflow dans un worktree :**

```bash
# 1. Tu es sur la home-base (ex: refactor)
git status  # Sur la branche refactor

# 2. Créer une feature branch pour ton ticket
git checkout -b feat/xxx-description

# 3. Travailler, committer...
git add .
git commit -m "feat(scope): description"

# 4. Push la feature branch (JAMAIS la home-base)
git push origin feat/xxx-description

# 5. Créer une PR vers master (via gh CLI)

# 6. Une fois mergé, revenir à la home-base et sync
git checkout refactor
git pull origin master
```

---

## Commandes de synchronisation

### Sync un worktree avec master

```bash
# Dans le worktree concerné
git checkout <home-base>  # refactor, debug...
git fetch origin
git reset --hard origin/master
```

**ATTENTION** : Cette commande écrase la branche home-base locale. C'est volontaire car elle ne doit contenir aucun travail direct.

---

## Template de sortie

### Liste des worktrees

```
🌳 WORKTREES

Repo : claude-review-automation

| Usage | Chemin | Home-base | Branche actuelle |
|-------|--------|-----------|------------------|
| principal | .../claude-review-automation | - | master |
| refactor | .../.claude/worktrees/refactor | refactor | refactor |

💡 Ouvrir une session :
   cd <chemin> && claude

🔄 Synchroniser avec master :
   git checkout <home-base> && git pull origin master
```

### Création de worktree

```
🌳 WORKTREE CRÉÉ

Nom       : <nom>
Chemin    : <chemin>
Home-base : <nom> (basée sur master)

⚠️  Installer les dépendances :
   cd <chemin> && yarn install

💡 Lancer une session :
   cd <chemin> && claude

🚨 Rappel : JAMAIS push sur master, toujours créer une PR !
```

### Connexion à un worktree

```
🔌 CONNECTÉ AU WORKTREE

Worktree : <nom>
Chemin   : <chemin>
Branche  : <branche_actuelle>
Statut   : <propre|modifié>

📍 Vous êtes maintenant dans le worktree <nom>

🔄 Sync avec master : git pull origin master
🚨 Rappel : JAMAIS push sur master, toujours créer une PR !
```

---

## Règles

- 🚨 **JAMAIS** push direct sur `master`
- 🚨 **JAMAIS** commit sur `master`
- ✅ **TOUJOURS** créer une PR pour merger vers `master`
- ✅ **SEULE** action sur `master` : `git pull origin master`
- **TOUJOURS** créer les worktrees dans `.claude/worktrees/`
- **TOUJOURS** utiliser des chemins absolus dans les commandes affichées
- **TOUJOURS** rappeler de lancer `yarn install` après création
- **VÉRIFIER** que la branche n'est pas déjà checkout dans un autre worktree

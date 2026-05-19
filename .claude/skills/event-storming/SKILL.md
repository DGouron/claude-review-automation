---
name: event-storming
description: "Event Storming Big Picture on a bounded context or the whole project. Explores code to discover domain events, commands, entities, context boundaries, and produces structured markdown following Vaughn Vernon's strategic patterns. Usage: /event-storming <bc-name> or /event-storming global"
---

# Event Storming Big Picture

Tu es un facilitateur Event Storming (Alberto Brandolini) specialise en DDD strategique pour ReviewFlow (Node.js, Fastify 5, Clean Architecture).

Tu appliques les patterns strategiques de Vaughn Vernon (*Implementing Domain-Driven Design*) pour le Context Mapping.

## Terminologie Clean Architecture

Ce projet utilise la terminologie Clean Architecture, PAS DDD tactique.

| Clean Architecture (ce projet) | DDD tactique (NE PAS utiliser) |
|--------------------------------|-------------------------------|
| Entity (`entities/`) | Aggregate, Domain Entity |
| Use Case (`usecases/`) | Application Service, Command Handler |
| Gateway contract (`entities/<domain>/<domain>.gateway.ts`) | Repository, Port |
| Gateway impl (`interface-adapters/gateways/`) | Adapter, Repository Impl |
| Controller (`interface-adapters/controllers/`) | Inbound Adapter |
| Presenter (`interface-adapters/presenters/`) | Read Model Projection |
| View (`interface-adapters/views/`) | UI Component |
| Guard (`*.guard.ts`) | Specification, Validator |

Dans les livrables Event Storming, mapper vers cette terminologie :
- 🟨 **Entity** (pas "Aggregate") — `entities/<domain>/`
- 🟦 **Use Case** (pas "Command Handler") — `usecases/*.usecase.ts`
- 🟩 **Presenter** (pas "Read Model") — `interface-adapters/presenters/*.presenter.ts`
- ⬜ **Gateway** (pas "Repository") — `entities/*/*.gateway.ts` + `interface-adapters/gateways/*`

## Coding Standards

Lire `.claude/rules/coding-standards.md` AVANT de travailler.

## Ubiquitous Language

Lire `docs/reference/ubiquitous-language.md` — c'est la source de verite pour les termes du domaine.

## Modes d'execution

### Mode cible (par defaut)

Input : `/event-storming <bc-name>` (ex: `review`, `tracking`, `insight`, `job`)
Output : `docs/ddd/event-storming/<bc-name>.md` + mise a jour du document global

### Mode audit global

Input : `/event-storming global`
Output : `docs/ddd/EVENT_STORMING_BIG_PICTURE.md` avec tous les BCs

---

## Phase 1 : EXPLORATION — Decouvrir le domaine dans le code

ReviewFlow organise le code par **couches** (pas par modules). Les Bounded Contexts sont implicites, revelees par les repertoires dans `entities/`.

1. **Identifier les fichiers sources** du BC cible :

| Repertoire | Ce qu'il revele |
|------------|-----------------|
| `entities/<domain>/` | Entities, schemas, guards, gateway contracts, value objects |
| `usecases/<domain>/` ou `usecases/*.usecase.ts` | Commands (Use Cases) |
| `interface-adapters/controllers/webhook/` | Event handlers (webhook events → domain) |
| `interface-adapters/controllers/http/` | HTTP API commands |
| `interface-adapters/controllers/mcp/` | MCP tool commands |
| `interface-adapters/gateways/` | External system integrations |
| `interface-adapters/presenters/` | Read models / projections |
| `interface-adapters/views/dashboard/` | UI (Humble Objects) |
| `frameworks/` | Infrastructure (queue, logging, Claude invocation) |

2. **Scanner les patterns revelateurs** :

| Pattern fichier | Signification |
|-----------------|---------------|
| `*.usecase.ts` | Command / Use Case |
| `*.guard.ts` | Business Rule / Policy |
| `*.schema.ts` | Entity shape / validation |
| `*.gateway.ts` dans `entities/` | Gateway contract (frontiere du BC) |
| `*.gitlab.gateway.ts` / `*.github.gateway.ts` | Platform-specific gateway impl |
| `*.cli.gateway.ts` | CLI-based external interaction |
| `*.fileSystem.ts` / `*.memory.gateway.ts` | Persistence gateway impl |
| `*.presenter.ts` | Read model projection |
| `*.routes.ts` | HTTP endpoint → controller wiring |

| Pattern code | Signification |
|-------------|---------------|
| `UseCase<Input, Output>` | Command |
| `createGuard(schema, 'context')` | Business Rule |
| `z.object({...})` (Zod schema) | Entity / Value Object shape |
| `interface *Gateway` | Frontiere du BC (dependency inversion) |
| imports `@/entities/<autre-domain>/` | Relation cross-BC |
| imports `@/shared/` | Shared Kernel |
| `app.post('/webhooks/...')` dans routes.ts | External Event entry point |
| `PQueue` / queue patterns | Async processing |

3. **Analyser les relations** avec les autres BCs :
   - Quels gateway contracts sont definis vs implementes ?
   - Quels types de `shared/` sont utilises ?
   - Y a-t-il des imports directs vers `@/entities/<autre-domain>/` dans les use cases ?
   - Comment les controllers orchestrent-ils plusieurs use cases ?

## Phase 2 : MODELISATION — Structurer les decouvertes

Organiser selon le schema de couleurs Event Storming (Alberto Brandolini) :

| Couleur | Element | Source dans le code |
|---------|---------|---------------------|
| 🟧 Orange | **Domain Event** | Webhook events, state transitions, completion callbacks |
| 🟦 Bleu | **Use Case (Command)** | `*.usecase.ts`, controller handlers |
| 🟨 Jaune | **Entity** | `entities/`, schemas, types, value objects |
| 🟪 Violet | **Policy / Business Rule** | Guards, validations, conditions dans usecases |
| 🩷 Rose | **Hot Spot / Question** | Violations, incoherences, dette technique |
| 🟩 Vert | **Presenter** | Presenters, view models |
| ⬜ Blanc | **External System (Gateway)** | Gateway implementations, CLI calls, API calls |

## Phase 3 : CONTEXT MAPPING — Patterns de Vaughn Vernon

Pour chaque relation entre BCs, identifier le pattern applicable :

| Pattern | Signal dans le code |
|---------|---------------------|
| **Partnership** | Modifications synchronisees entre 2 domaines |
| **Shared Kernel** | Types dans `shared/` utilises par plusieurs domaines |
| **Customer-Supplier** | Gateway interface dans le consumer, implementation fournie par le supplier |
| **Conformist** | Import direct de types d'un autre domaine sans transformation |
| **Anti-Corruption Layer** | Controller/Adapter qui transforme les donnees d'une plateforme (GitLab/GitHub → domain) |
| **Open Host Service** | API HTTP/MCP exposee par le BC |
| **Published Language** | Schemas Zod partages, webhook event formats |
| **Separate Ways** | Aucun import croise |

### ACL specifique a ReviewFlow

Le pattern ACL est central dans ReviewFlow — les controllers webhook transforment les evenements GitLab/GitHub en concepts domaine :
- `GitLab MergeRequest Event` → `ReviewRequest` (ACL dans gitlab.controller.ts)
- `GitHub PullRequest Event` → `ReviewRequest` (ACL dans github.controller.ts)

## Phase 4 : REDACTION

Utiliser les templates dans `references/templates.md` pour produire les livrables.

**Regles de redaction :**
- Documents en **anglais** (documentation language du projet)
- Noms au **passe** pour les Domain Events : `ReviewCompleted`, pas `CompleteReview`
- Noms **imperatifs** pour les Commands : `TriggerReview`, pas `ReviewTriggered`
- Toujours nommer le **pattern Vaughn Vernon** pour les relations, pas juste "depends on"
- Toujours referencer le **fichier source exact**, pas un repertoire vague
- Respecter le **ubiquitous language** defini dans `docs/reference/ubiquitous-language.md`

## Phase 5 : ECRITURE LOCALE

1. Creer `docs/ddd/event-storming/` si inexistant
2. Ecrire le document par BC : `docs/ddd/event-storming/<bc-name>.md`
3. Lire le document global existant (s'il existe)
4. Mettre a jour le document global `docs/ddd/EVENT_STORMING_BIG_PICTURE.md` (enrichir, jamais ecraser)
5. Afficher un resume des decouvertes cles

## Phase 6 : PUBLICATION WIKI GITHUB

Apres l'ecriture locale, publier sur le wiki GitHub pour une lecture confortable.

### Structure wiki

```
Home.md                              ← Landing page with links
_Sidebar.md                          ← Side navigation
DDD-Event-Storming-Big-Picture.md    ← Global document
DDD-Event-Storming-<BC-Name>.md      ← Per-BC document (PascalCase)
```

### Commandes

```bash
cd /tmp && rm -rf review-flow.wiki
git clone "https://$(gh auth token)@github.com/DGouron/review-flow.wiki.git" review-flow.wiki
cd review-flow.wiki

# Copy/update pages
# Enrich _Sidebar.md with new links
# Enrich Home.md with new links in Navigation section

git add -A && git commit -m "docs: update event storming — <bc-name>" && git push origin master
```

### Conventions

- Nommage des pages : `DDD-Event-Storming-<BC-Name>` (PascalCase, tirets)
- Toujours mettre a jour `_Sidebar.md` et la section Navigation de `Home.md`
- Utiliser des diagrammes Mermaid (supportes nativement par GitHub wiki)
- Ajouter des liens de navigation en bas de chaque page (← Big Picture / Home)

## Contraintes

- **Read-first** : toujours lire le code source, ne jamais inventer des events ou commands
- **Incremental** : ne jamais ecraser le document global, toujours enrichir
- **Hot Spots** : signaler les violations de frontiere, imports cross-domain, dette technique
- **Ubiquitous Language** : toujours verifier contre `docs/reference/ubiquitous-language.md`
- Ne PAS commiter le repo principal — laisser l'utilisateur decider via `/commit`

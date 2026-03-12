---
name: e2e
description: Guide pour les tests end-to-end Playwright. Utiliser pour créer un nouveau test e2e, un Page Object, ou débugger un test flaky. Rappelle les patterns, workarounds et conventions du projet.
---

# Playwright E2E Testing Guide

## Persona

Read `.claude/roles/code-reviewer.md` — adopt this profile and follow all its rules.

## Activation

Ce skill s'active pour :
- Créer un nouveau test e2e
- Créer un Page Object
- Débugger un test flaky
- Tester une feature critique (parcours utilisateur complet)

---

## Architecture

```
src/tests/e2e/
├── .auth/                    # Session authentifiée (gitignored)
├── fixtures/
│   └── test-data.ts          # Données de test (users, selections, etc.)
├── page-objects/
│   ├── shared/
│   │   └── BasePage.ts       # Utilitaires communs
│   ├── auth/
│   │   └── LoginPage.ts      # Authentification
│   └── school/
│       └── <Page>Page.ts     # Pages par contexte
├── specs/
│   ├── auth.setup.ts         # Setup authentification (run once)
│   └── <context>/
│       └── <feature>.spec.ts # Tests par feature
└── utils/
    └── test-helpers.ts       # Helpers (login, API setup)
```

---

## Commandes

| Commande | Usage |
|----------|-------|
| `yarn e2e` | Exécuter tous les tests |
| `yarn e2e:ui` | Mode interactif avec UI Playwright |
| `yarn e2e:debug` | Mode debug avec inspector |
| `yarn e2e:headed` | Navigateur visible |
| `yarn test:e2e:report` | Voir le rapport HTML |

---

## Workflow : Créer un nouveau test

### 1. Identifier le contexte

```
specs/
├── auth.setup.ts           # Setup (ne pas toucher)
├── school/                 # Tests école
├── student/                # Tests étudiant
└── company/                # Tests entreprise
```

### 2. Vérifier le Page Object

**Page Object existe ?**
- Oui → L'importer et l'utiliser
- Non → Le créer d'abord (voir section suivante)

### 3. Écrire le test

```typescript
// specs/school/my-feature.spec.ts
import { test, expect } from "@playwright/test";
import { MyFeaturePage } from "../../page-objects/school/MyFeaturePage";

test.describe("My Feature", () => {
  // Utilise la session pré-authentifiée (85% plus rapide)
  test.use({ storageState: "src/tests/e2e/.auth/school.json" });

  test("should do something", async ({ page }) => {
    const myFeaturePage = new MyFeaturePage(page);

    // ⚠️ WORKAROUND: Router race condition
    await page.waitForTimeout(2000);

    await myFeaturePage.navigate();
    await myFeaturePage.waitForPageLoad();

    // Assertions
    await expect(page.getByTestId("my-element")).toBeVisible();
  });
});
```

### 4. Exécuter et valider

```bash
# Mode interactif pour debug
yarn e2e:ui

# Exécuter un seul fichier
yarn e2e specs/school/my-feature.spec.ts
```

---

## Workflow : Créer un Page Object

### Template

```typescript
// page-objects/school/MyFeaturePage.ts
import { Page } from "@playwright/test";
import { BasePage } from "../shared/BasePage";

export class MyFeaturePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Navigation
  async navigate(): Promise<void> {
    await this.page.goto("/my-feature");
    await this.waitForPageLoad();
  }

  async waitForPageLoad(): Promise<void> {
    await this.waitForElement('[data-testid="my-feature-page"]');
  }

  // Actions
  async clickPrimaryButton(): Promise<void> {
    await this.safeClick('[data-testid="primary-button"]');
  }

  async fillSearchInput(text: string): Promise<void> {
    await this.safeFill('[data-testid="search-input"]', text);
  }

  // Queries
  async getItemCount(): Promise<number> {
    const items = await this.page.locator('[data-testid="item"]').all();
    return items.length;
  }

  async hasItems(): Promise<boolean> {
    return this.isElementVisible('[data-testid="item"]');
  }

  // Semantic selectors (accessibilité)
  async clickTab(tabName: string): Promise<void> {
    await this.page.getByRole("tab", { name: tabName }).click();
  }
}
```

### Conventions

| Méthode | Pattern | Exemple |
|---------|---------|---------|
| Navigation | `navigate()`, `goTo<Page>()` | `navigateToDetails()` |
| Attente | `waitFor<Element>()` | `waitForTableLoad()` |
| Actions | `click<Element>()`, `fill<Input>()` | `clickSubmitButton()` |
| Queries | `get<Data>()`, `has<Element>()` | `getFirstItemId()` |

---

## Sélecteurs (priorité)

| Priorité | Type | Exemple |
|----------|------|---------|
| 1 | `data-testid` | `[data-testid="submit-btn"]` |
| 2 | Role (accessibilité) | `getByRole("button", { name: "Submit" })` |
| 3 | Text | `getByText("Valider")` |
| 4 | CSS (dernier recours) | `table tbody tr` |

```typescript
// ✅ Préféré : data-testid
await page.getByTestId("submit-button").click();

// ✅ Accessible : role-based
await page.getByRole("button", { name: "Submit" }).click();

// ⚠️ Fragile : text exact
await page.getByText("Soumettre").click();

// ❌ À éviter : sélecteurs CSS complexes
await page.locator("div.container > button.primary").click();
```

---

## Workarounds connus

### Router Race Condition

**Problème** : `auth()` appelé sans `await` dans `Router.tsx:91` cause des re-renders intempestifs.

**Symptômes** :
- Page apparaît puis disparaît
- Redirect inattendu vers `/auth/login`
- Tests flaky

**Solution temporaire** :

```typescript
// Avec storageState (cookies déjà chargés)
await page.waitForTimeout(2000);

// Après login complet (sans storageState)
await page.waitForTimeout(10000);
```

**Fix définitif** : Ajouter `await` à `Router.tsx:91`

### External Scripts Timeout (Firefox)

Google Maps et Hotjar causent des timeouts. **Solution** : Tests uniquement sur Chromium.

---

## Authentification

### StorageState Pattern (recommandé)

Le setup (`auth.setup.ts`) s'exécute une fois et sauvegarde la session dans `.auth/school.json`.

```typescript
// Réutiliser la session pré-authentifiée
test.use({ storageState: "src/tests/e2e/.auth/school.json" });
```

**Avantages** :
- 85-90% plus rapide (pas de login à chaque test)
- Tests indépendants
- Cookies et localStorage persistés

### Login manuel (cas spécifiques)

```typescript
import { loginAsSchool, loginAsStudent } from "../utils/test-helpers";

test("should test login flow", async ({ page }) => {
  // Vider les cookies pour tester le flow complet
  await page.context().clearCookies();
  await loginAsSchool(page);
});
```

---

## Fixtures et données de test

### Utiliser les fixtures existantes

```typescript
import { TEST_USERS, TEST_SELECTIONS, TEST_CAMPUSES } from "../fixtures/test-data";

test("should filter by campus", async ({ page }) => {
  await myPage.applyCampusFilter(TEST_CAMPUSES.paris.name);
});
```

### Ajouter des données

```typescript
// fixtures/test-data.ts
export const TEST_USERS = {
  school: {
    email: process.env.TEST_SCHOOL_EMAIL || "",
    password: process.env.TEST_SCHOOL_PASSWORD || "",
    profileName: process.env.TEST_SCHOOL_NAME || "",
  },
  // Ajouter ici...
};
```

---

## Debug des tests flaky

### 1. Mode debug

```bash
yarn e2e:debug specs/school/my-test.spec.ts
```

### 2. Trace on failure

Les traces sont activées sur le premier retry. Après un échec :

```bash
yarn test:e2e:report
```

### 3. Screenshots et logs

```typescript
// Ajouter des points de contrôle
console.log("🔍 Step: Navigating to page");
await page.screenshot({ path: "debug-step-1.png" });
```

### 4. Patterns de stabilisation

```typescript
// ❌ Flaky : attendre un élément sans timeout explicite
await page.click("#button");

// ✅ Stable : utiliser les méthodes du Page Object
await myPage.safeClick('[data-testid="button"]');

// ✅ Stable : attendre la réponse API
await myPage.waitForApiResponse("/api/data");
```

---

## Checklist nouveau test

- [ ] Page Object existe ou créé
- [ ] `storageState` utilisé pour l'auth
- [ ] Workaround Router (2s wait) ajouté
- [ ] Sélecteurs `data-testid` ou `role`
- [ ] Assertions avec `expect()` de Playwright
- [ ] Test exécuté en mode `e2e:ui`
- [ ] Pas de données hardcodées (utiliser fixtures)

---

## Anti-patterns

| ❌ Éviter | ✅ Préférer |
|-----------|-------------|
| `page.waitForTimeout(5000)` arbitraire | `waitForElement()`, `waitForApiResponse()` |
| Sélecteurs CSS complexes | `data-testid`, `getByRole()` |
| Login à chaque test | `storageState` pattern |
| Données hardcodées | Fixtures `test-data.ts` |
| Logique dans les tests | Méthodes dans Page Objects |
| Tests dépendants entre eux | Tests isolés |

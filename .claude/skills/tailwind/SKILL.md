---
name: tailwind
description: Guide TailwindCSS et Design System MentorGoal. Utiliser pour créer/modifier des composants UI, optimiser les styles, ou résoudre des problèmes de layout.
---

# TailwindCSS & Design System Guide

## Activation

Ce skill s'active pour :
- Création ou modification de composants UI
- Optimisation des styles et performance
- Résolution de problèmes de layout/responsive
- Review des classes Tailwind

## Principes fondamentaux

```
Mobile-First → Utility-First → Design Tokens
```

> Toujours utiliser les tokens du Design System avant d'ajouter des valeurs arbitraires.

---

## Configuration Design System

### Tokens disponibles

Les tokens sont définis dans `tailwind.config.js`. Toujours vérifier les valeurs existantes :

```typescript
// ✅ Utiliser les tokens
className="bg-primary-700P text-white"
className="p-sm rounded-md"

// ❌ Éviter les valeurs arbitraires
className="bg-[#2a4054] text-[#fff]"
className="p-[12px] rounded-[6px]"
```

### Breakpoints (Mobile-First)

```
default  → Mobile
md:      → Tablet (768px+)
lg:      → Desktop (1024px+)
xl:      → Large Desktop (1280px+)
```

---

## Best Practices

### Structure des classes

Ordre recommandé :
1. Layout (`flex`, `grid`, `block`)
2. Spacing (`p-`, `m-`, `gap-`)
3. Sizing (`w-`, `h-`, `max-w-`)
4. Typography (`text-`, `font-`)
5. Colors (`bg-`, `text-`, `border-`)
6. States (`hover:`, `focus:`, `active:`)

```typescript
// ✅ Bien organisé
className="flex items-center gap-4 p-4 w-full text-sm text-gray-700 bg-white hover:bg-gray-50"
```

### Composants réutilisables

Utiliser `@apply` sparingly - préférer les composants React :

```typescript
// ✅ Composant Button atomique
<Button variant="primary" size="sm">
  Click me
</Button>

// ❌ Répéter les classes partout
<button className="bg-primary-700P text-white px-4 py-2 rounded hover:bg-primary-600">
  Click me
</button>
```

### Variantes avec CVA (Class Variance Authority)

```typescript
import { cva } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors",
  {
    variants: {
      variant: {
        primary: "bg-primary-700P text-white hover:bg-primary-600",
        outline: "border border-primary-150 hover:bg-primary-50",
        toggle: "border border-primary-700P bg-primary-50 text-primary-700P",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);
```

---

## Responsive Design

### Mobile-First Approach

```typescript
// ✅ Mobile-first
className="flex flex-col md:flex-row"
className="hidden md:block"
className="w-full md:w-1/2 lg:w-1/3"

// ❌ Desktop-first (à éviter)
className="flex flex-row md:flex-col"
```

### Container Queries

Pour les composants qui dépendent de leur container :

```typescript
className="@container"
className="@md:flex-row @lg:gap-6"
```

---

## Performance

### PurgeCSS

Tailwind purge automatiquement les classes non utilisées. S'assurer que :
- Toutes les classes sont écrites en entier (pas de concaténation dynamique)
- Les fichiers sont dans le `content` de `tailwind.config.js`

```typescript
// ✅ Purge-safe
const color = isActive ? "bg-green-500" : "bg-red-500";

// ❌ Non purgeable
const color = `bg-${status}-500`; // Tailwind ne peut pas détecter
```

### JIT Mode

Activé par défaut. Permet les valeurs arbitraires quand nécessaire :

```typescript
// Acceptable quand aucun token n'existe
className="w-[calc(100%-32px)]"
className="grid-cols-[1fr_2fr_1fr]"
```

---

## Design System Atoms

### Localisation dans le projet

```
src/
├── designSystem/
│   ├── atoms/          # Button, Input, Badge, etc.
│   ├── molecules/      # FormField, Card, Modal, etc.
│   └── organisms/      # Header, Sidebar, DataTable, etc.
└── shared/
    └── components/
        └── atoms/      # Composants partagés cross-context
```

### Avant de créer un composant

1. Vérifier s'il existe dans `designSystem/`
2. Vérifier s'il existe dans `shared/components/`
3. Si non, créer dans le bon niveau atomique

---

## Anti-patterns

### ❌ À éviter

```typescript
// Inline styles
style={{ backgroundColor: '#2a4054' }}

// Classes dupliquées (extraire dans un composant)
<div className="flex items-center gap-2 p-4 bg-white rounded shadow">
<div className="flex items-center gap-2 p-4 bg-white rounded shadow">
<div className="flex items-center gap-2 p-4 bg-white rounded shadow">

// Valeurs arbitraires quand un token existe
className="text-[14px]"  // Utiliser text-sm

// Important (sauf cas extrême)
className="!p-4"
```

### ✅ Bonnes pratiques

```typescript
// Utiliser les composants du Design System
<Card className="p-4">
  <CardHeader>Title</CardHeader>
  <CardContent>Content</CardContent>
</Card>

// Utiliser tailwind-merge pour éviter les conflits
import { cn } from "@/lib/utils";
className={cn("base-classes", conditionalClass, className)}
```

---

## Debugging

### Outils recommandés

- **Tailwind CSS IntelliSense** (VS Code extension)
- **Browser DevTools** → Inspect element
- **Tailwind Play** (https://play.tailwindcss.com) pour prototyper

### Classes qui ne s'appliquent pas ?

1. Vérifier l'ordre de spécificité
2. Vérifier si la classe est purgée
3. Utiliser `tailwind-merge` pour résoudre les conflits

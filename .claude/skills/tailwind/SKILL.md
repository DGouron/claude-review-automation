---
name: dashboard-styling
description: Guide for ReviewFlow dashboard styling conventions. Use when creating/modifying dashboard UI, optimizing styles, or resolving layout issues.
---

# Dashboard Styling Guide

> **Note**: ReviewFlow does not use TailwindCSS or React. The dashboard is built with plain HTML, CSS custom properties, and vanilla JavaScript. This skill covers the styling conventions for the dashboard.

## Activation

This skill activates for:
- Creating or modifying dashboard UI elements
- Optimizing styles and performance
- Resolving layout/responsive issues
- Reviewing CSS conventions

## Principles

```
CSS Custom Properties → Semantic naming → Consistent spacing
```

> Always use existing CSS custom properties (design tokens) before adding new values.

---

## Design Tokens

### Available tokens

Tokens are defined as CSS custom properties in `src/interface-adapters/views/dashboard/styles.css`:

```css
:root {
  /* Backgrounds */
  --nsc-bg-base: #0b1220;
  --nsc-bg-elevated: #111a2b;
  --nsc-bg-surface: #162235;
  --nsc-bg-surface-strong: #1c2a40;

  /* Borders */
  --nsc-border-soft: rgba(163, 192, 224, 0.16);
  --nsc-border-strong: rgba(163, 192, 224, 0.28);

  /* Text */
  --nsc-text-primary: #e8efff;
  --nsc-text-secondary: #b2c1dd;
  --nsc-text-muted: #8393b0;

  /* Accent colors */
  --nsc-focus: #7ad8ff;
  --nsc-action: #60c7ff;
  --nsc-warning: #f4bc71;
  --nsc-success: #62d3a8;
  --nsc-danger: #f07f88;
}
```

```css
/* Use tokens */
background: var(--nsc-bg-surface);
color: var(--nsc-text-primary);
border: 1px solid var(--nsc-border-soft);

/* Avoid hardcoded values */
background: #162235;
color: #e8efff;
```

---

## Best Practices

### Naming conventions

Use semantic, BEM-inspired class names:

```css
/* Good: semantic and descriptive */
.review-card { }
.review-card__header { }
.review-card__score { }
.review-card--critical { }

/* Bad: generic or cryptic */
.card1 { }
.blue-box { }
.mt20 { }
```

### Property order

Recommended order in declarations:
1. Layout (`display`, `flex`, `grid`)
2. Positioning (`position`, `top`, `left`)
3. Box model (`margin`, `padding`, `width`, `height`)
4. Typography (`font-`, `text-`, `line-height`)
5. Visual (`background`, `border`, `color`)
6. Misc (`cursor`, `opacity`, `transition`)

### Reusable patterns

Extract repeated patterns into shared classes:

```css
/* Reusable surface pattern */
.surface {
  background: var(--nsc-bg-surface);
  border: 1px solid var(--nsc-border-soft);
  border-radius: 8px;
  padding: 16px;
}

.surface--elevated {
  background: var(--nsc-bg-elevated);
}
```

---

## Responsive Design

### Mobile-first approach

```css
/* Base styles = mobile */
.dashboard-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Tablet and above */
@media (min-width: 768px) {
  .dashboard-grid {
    flex-direction: row;
    flex-wrap: wrap;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
  }
}
```

---

## File structure

```
src/interface-adapters/views/dashboard/
├── index.html       # Dashboard HTML template
└── styles.css       # All dashboard styles
```

### Before adding styles

1. Check if a CSS custom property already exists for the value
2. Check if a similar class already exists in `styles.css`
3. If not, add using existing naming conventions

---

## Anti-patterns

### To avoid

```css
/* Inline styles in HTML */
style="background-color: #2a4054"

/* Hardcoded colors instead of tokens */
color: #e8efff;  /* Use var(--nsc-text-primary) */

/* !important (except extreme cases) */
padding: 16px !important;

/* Deep nesting */
.dashboard .main .section .card .header .title { }
/* Prefer: .card__title { } */

/* Magic numbers without explanation */
margin-top: 37px;
```

### Good practices

```css
/* Use custom properties consistently */
.status-badge {
  background: var(--nsc-bg-surface-strong);
  color: var(--nsc-text-secondary);
  border: 1px solid var(--nsc-border-soft);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.75rem;
}

.status-badge--success {
  color: var(--nsc-success);
  border-color: var(--nsc-success);
}

.status-badge--danger {
  color: var(--nsc-danger);
  border-color: var(--nsc-danger);
}
```

---

## Debugging

### Recommended tools

- **Browser DevTools** -> Inspect element, computed styles
- Check CSS custom property values in the `:root` selector
- Use the Elements panel to verify which styles are being applied or overridden

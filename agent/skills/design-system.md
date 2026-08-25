# Premium Frontend UI Architect

> **Mai's design skill** — an internal design handbook that Mai uses to generate,
> evaluate, and refine its own web UI. Every pixel Mai renders should trace back
> to these principles.
>
> Target quality: Linear, Notion, Vercel, Raycast, Cursor, Arc Browser, ChatGPT,
> GitHub, and Apple's Human Interface Guidelines.

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Layout System](#layout-system)
3. [Typography](#typography)
4. [Color System](#color-system)
5. [Components](#components)
6. [Dashboard Design](#dashboard-design)
7. [Forms](#forms)
8. [Motion & Animation](#motion--animation)
9. [Accessibility (WCAG 2.2 AA)](#accessibility)
10. [Responsive Design](#responsive-design)
11. [Performance](#performance)
12. [React Architecture](#react-architecture)
13. [Tailwind CSS](#tailwind-css)
14. [Design Systems](#design-systems)
15. [AI Product Design](#ai-product-design)
16. [SDK & Developer Documentation Pages](#sdk--developer-documentation-pages)
17. [SaaS Landing Pages](#saas-landing-pages)
18. [Empty States, Onboarding & Loading Skeletons](#empty-states-onboarding--loading-skeletons)
19. [Charts, Timelines, Kanban Boards & Calendars](#charts-timelines-kanban-boards--calendars)
20. [shadcn/ui Conventions](#shadcnui-conventions)
21. [Common Mistakes](#common-mistakes)
22. [Pre-Flight Checklist](#pre-flight-checklist)

---

## Philosophy

This section is the foundation. Every design decision you make should trace back to these principles. Without them, you are decorating — not designing.

### Always Prefer Clean, Modern, Premium SaaS Interfaces

Your default aesthetic is the intersection of Linear's precision, Vercel's restraint, and Raycast's density. Think: high information density without clutter, clear action hierarchies, generous whitespace used as structure not filler, and a confidence that comes from knowing what to leave out. The interface should feel like it was built by engineers who care about craft — because it was.

When you approach any UI, start by asking: what are the three most important things the user needs to do right now? Build for those three things first. Everything else serves those actions or gets out of their way. Premium SaaS products do not overwhelm — they focus. A settings page with 40 options should surface the 5 most used prominently and tuck the rest behind sensible groupings and search.

Avoid the temptation to add "personality" through decoration. Personality in a premium interface comes from thoughtful interactions, crisp typography, purposeful color use, and the sense that every pixel was placed deliberately. Notion's personality is in its block-based ergonomics, not its color palette. Linear's personality is in its keyboard-first speed, not its use of purple. Build the personality into the behavior.

### Visual Hierarchy

Visual hierarchy is how you tell the user what to look at first, second, and third — without saying a word. It is the single most important design skill, and the one most often fumbled. Without clear hierarchy, an interface is a flat field of noise.

Establish hierarchy through **contrast in scale, weight, and color**. The primary action on any page should be visually undeniable. If a user has to hunt for "Save," "Submit," or "Create," the hierarchy has failed. Use size differentials of at least 2:1 between heading levels. Make primary buttons bold and colored; make secondary buttons ghosted or outlined. Use optical weight — a 14px semibold label can read as more prominent than a 16px regular one if the context demands it.

Think in three tiers: **anchor, supporting, ambient**. The anchor is the single most important element — a dashboard's key metric, a form's primary action, a landing page's hero headline. Supporting elements provide context — charts beneath the key metric, helper text beside the input, feature cards beneath the hero. Ambient elements fill the remaining space — navigation, timestamps, metadata, decorative details. If everything is anchors, nothing is. If everything is ambient, the user is lost.

Test hierarchy by squinting at your layout. What jumps out? That's what a user sees in their first 200ms. If the wrong thing jumps out, you have a hierarchy problem, not a color problem. Do not fix it by making everything bigger — fix it by making the less-important things quieter.

### Reducing Cognitive Load

Cognitive load is the mental effort required to use your interface. Every unnecessary decision, unclear label, or ambiguous state adds friction. Great interfaces minimize cognitive load so the user can focus on their actual task.

**Chunk information into groups of 5–7 items.** Miller's law applies directly to UI design. A navigation with 15 items in a flat list is overwhelming. Group those 15 items into 3–4 categories with clear labels. A form with 12 fields should break into logical sections — "Account Details," "Notification Preferences," "Billing." Use whitespace and dividers to reinforce groupings.

**Use progressive disclosure.** Do not show everything at once. Reveal complexity as the user needs it. Advanced settings should be collapsed by default. Filter options can appear after a search query. A complex configuration flow can break into steps rather than a single overwhelming form. The user should feel like the interface is guiding them, not dumping everything on them.

**Be predictable.** Users build mental models of how interfaces work. If your "Save" button is always in the bottom-right, keep it there. If clicking a row expands it in one table, do the same in all tables. If modals close on Escape, they should all close on Escape. Consistency across your product reduces cognitive load because users learn once and apply everywhere.

**Label everything.** Never rely on icon-only buttons for critical actions. A trash can icon means different things to different people. Pair it with a tooltip or visible label. Use descriptive, action-oriented labels — "Delete project" not just "Delete" — so the user knows exactly what will happen.

### Consistency Over Decoration

Consistency is the invisible force that makes a product feel professional. It is not exciting, but it is what separates a product from a prototype. Every time the user encounters an inconsistency — a button that is blue here but gray there, a modal that slides in from the left but another that fades — it erodes trust and adds micro-friction.

Establish conventions and document them. If all section headings are 20px Inter semibold with an 8px bottom margin, they should be that everywhere. If cards have 16px padding and a 1px border, they should have that everywhere. Use design tokens (covered in the Design Systems section) to enforce this at the code level — a `--radius-lg` token used everywhere means you change the radius in one place and it updates everywhere.

Consistency applies to patterns, not just pixels. If forms validate on blur, all forms validate on blur. If dropdowns close when you click outside, all dropdowns should close when you click outside. If success states show a checkmark and a message, they should all show a checkmark and a message. Pattern consistency is harder to enforce with tokens, so build reusable components that encapsulate these behaviors — that way the consistency is built into the component, not left to the developer's memory.

That said, consistency should not be an excuse for laziness. If a specific context genuinely calls for a different pattern — a destructive confirmation that needs to be more dramatic than your usual confirmation dialog — break the pattern deliberately and document why. The key word is "deliberately."

### Usability Before Aesthetics

A beautiful interface that is hard to use is a failure. A plain interface that is effortless to use is a success that can be made beautiful later. Always prioritize usability in your decision-making. Ask: does this design decision help the user accomplish their task faster, more accurately, or with less frustration? If not, it is decoration, and decoration is the lowest priority.

Usability means: clear labels, logical tab order, predictable interactions, fast load times, responsive on all devices, and accessible to all users. These are table stakes. Aesthetics — color choices, animation curves, shadow depths — layer on top of a usable foundation. Never sacrifice a usable moment for a pretty one. A subtle animation that delays a user's ability to click a button by 200ms is a net negative, regardless of how smooth it looks.

This does not mean aesthetics are unimportant. They are important. But they amplify usability — a well-designed color system makes scanning faster; well-chosen typography improves reading speed; thoughtful motion guides attention. Aesthetics serve usability. When they conflict, usability wins.

### Accessibility

Accessibility is not optional and it is not a phase to add later. It is a core design constraint that produces better interfaces for everyone. A form with proper labels is easier to use for sighted users too. A page with good keyboard navigation is faster for power users. Sufficient contrast ratios improve readability in bright environments.

Build accessibility in from the start. Use semantic HTML — `<button>` for buttons, `<nav>` for navigation, `<main>` for content, `<article>` for self-contained sections. Add ARIA labels where semantic HTML is insufficient. Ensure all interactive elements are reachable via Tab and activatable via Enter/Space. Test with a screen reader (VoiceOver on macOS, NVDA on Windows) during development, not after.

The WCAG 2.2 AA standard is the minimum bar. This means 4.5:1 contrast for normal text, 3:1 for large text (18px+ or 14px bold+), visible focus indicators, no content that flashes more than three times per second, and all functionality available via keyboard. We cover this in depth in the Accessibility section.

### Responsive-First Thinking

Design for the smallest screen first, then enhance for larger screens. This discipline forces you to prioritize content and functionality — when you have 375px of width, you cannot afford decorative elements or low-priority information. Every element earns its place.

Mobile-first does not mean desktop is an afterthought. It means the mobile layout is the foundation, and desktop adds parallel layouts, more columns, hover states, and expanded detail views. A card grid that stacks on mobile and goes 2-column on tablet and 4-column on desktop is responsive-first thinking. A layout that only works at 1440px and breaks on anything smaller is not.

Use a defined breakpoint system — covered in the Responsive Design section — and test at every breakpoint, not just the two extremes. A layout that works at 375px and 1440px but breaks at 768px (tablet) is a common failure mode.

### Progressive Disclosure

Progressive disclosure is the practice of revealing information and functionality gradually, as the user needs it. It is the antidote to the "kitchen sink" interface that shows everything at once and overwhelms the user.

The pattern is: **show the most common, most important thing first. Then provide affordances to reveal more.** In a settings page, the 5 most-used settings are visible; the remaining 20 are grouped under "Advanced" or behind a search. In a data table, the 4 most important columns are shown; additional columns are available via a "Columns" dropdown. In a navigation menu, the 6 top-level items are shown; nested items appear on hover or click.

Progressive disclosure applies at every scale. At the page level, it means a clean dashboard with clear primary actions and secondary options tucked away. At the component level, it means a dropdown that shows recent items first, then "Show all." At the interaction level, it means a button that reveals additional options on hover or long-press rather than showing all options simultaneously.

The key principle is: **the user should never have to think about what they do not need right now.** If they need more, they know where to find it. The interface removes unnecessary choices from view without removing them from reach.

### Delight Through Subtle Motion

Motion in a premium interface is understated and purposeful. It guides attention, confirms actions, and creates a sense of physicality — that things have weight, position, and momentum. The best motion is the kind the user feels but does not consciously notice.

Use motion for four things: **feedback** (a button ripple confirming a click), **orientation** (a panel sliding in from the right establishing spatial memory), **focus** (a subtle pulse drawing attention to a changed value), and **continuity** (a list item smoothly collapsing when deleted rather than popping away).

Keep durations short. UI animations should complete in 100–300ms for micro-interactions (hover states, toggles, button presses), 200–400ms for element transitions (panel slides, tab switches, modal appearances), and 300–500ms for page-level transitions. Anything longer than 500ms feels sluggish. Anything shorter than 50ms feels instant and is usually not worth the animation complexity.

Use easing curves that mirror physics. `ease-out` (deceleration) for elements entering the screen — they arrive fast and settle. `ease-in` (acceleration) for elements leaving — they start slow and accelerate away. `ease-in-out` for elements moving across the screen — they accelerate and decelerate. These curves feel natural because they match how objects move in the real world.

Always respect `prefers-reduced-motion`. Wrap animations in a media query and either reduce duration to near-zero or eliminate them entirely. Users who prefer reduced motion have chosen that preference for a reason — respect it without exception.

---

## Layout System

Layout is the skeleton of your interface. A strong layout creates rhythm, establishes relationships between elements, and makes content scannable without effort. A weak layout forces the user to work to understand structure.

### The 8px Spacing System

All spacing values should be multiples of 4px, with 8px as the base unit. This creates a consistent rhythm across the entire interface and eliminates arbitrary spacing decisions.

**Core spacing scale:**

| Token | Value | Use |
|-------|-------|-----|
| `--space-1` | 4px | Tight icon-to-label gaps, inline spacing |
| `--space-2` | 8px | Default padding for small elements, related items |
| `--space-3` | 12px | Compact card padding, list item padding |
| `--space-4` | 16px | Standard card padding, form group spacing |
| `--space-5` | 20px | Section heading to content |
| `--space-6` | 24px | Between major form sections |
| `--space-8` | 32px | Between card groups, major layout sections |
| `--space-10` | 40px | Page section separation |
| `--space-12` | 48px | Major page divisions |
| `--space-16` | 64px | Hero spacing, large section gaps |

In Tailwind, these map directly: `p-1` (4px), `p-2` (8px), `p-3` (12px), `p-4` (16px), etc. Never use arbitrary spacing values like `mb-[13px]` unless there is a documented reason. If the spacing scale does not have the value you need, the scale is wrong — fix the scale, don't add one-offs.

### Grid Systems

Use CSS Grid for two-dimensional layouts (rows AND columns) and Flexbox for one-dimensional layouts (a row OR a column). The distinction matters: Grid defines the space, Flexbox distributes within it.

**For page-level layouts**, use a 12-column grid on desktop that collapses to fewer columns on smaller screens. A typical dashboard sidebar + content layout: `grid-template-columns: 260px 1fr` with a fixed sidebar and fluid content area. On mobile, this collapses to a single column with the sidebar becoming a hamburger menu or bottom tab bar.

**For component-level layouts**, use Flexbox. A button with an icon and label is a flex row. A card header with a title and action is a flex row with `justify-between`. A form with stacked inputs is a flex column with consistent gap.

**Grid template for common layouts:**

```
// Sidebar + Content
grid-template-columns: 260px 1fr;

// Three-column dashboard
grid-template-columns: 1fr 1fr 1fr;
gap: var(--space-4);

// Holy grail (header, sidebar, main, footer)
grid-template-areas:
  "header header"
  "sidebar main"
  "footer footer";
```

### Container Widths

Constrain content width for readability. Wide text columns are hard to read — the eye has to travel too far to find the next line. Use a max-width container for text-heavy content and wider containers for data-dense views.

| Context | Max Width | Why |
|---------|-----------|-----|
| Prose / documentation | 65ch (≈640px) | Optimal reading line length |
| Forms | 480px | Keeps label-input pairs scannable |
| Modals | 480px (small), 640px (medium), 720px (large) | Three defined sizes, no guessing |
| Page content | 1120px | Generous but not wall-to-wall |
| Full-width sections | 1280px or 1440px | Hero banners, dashboards |
| Dashboards | Fluid (100%) | Data density benefits from width |

Center containers with `margin: 0 auto` or `mx-auto` in Tailwind. On mobile, remove the max-width and let content flow edge-to-edge with horizontal padding of `var(--space-4)` (16px).

### Section Spacing

Vertical rhythm between sections creates a predictable cadence. Use consistent vertical spacing so the user develops an unconscious expectation of where the next section begins.

- **Between paragraphs:** `var(--space-4)` (16px)
- **Between heading and its content:** `var(--space-2)` (8px) — headings are visually closer to what they describe
- **Between heading and preceding content:** `var(--space-8)` (32px) — headings are farther from what came before
- **Between cards in a group:** `var(--space-4)` (16px)
- **Between card groups:** `var(--space-8)` (32px)
- **Between page-level sections:** `var(--space-12)` (48px) to `var(--space-16)` (64px)

### Card Spacing

Cards are the atomic unit of most SaaS layouts. Standardize their internal and external spacing.

- **Internal padding:** `var(--space-4)` (16px) for compact cards, `var(--space-6)` (24px) for standard cards
- **Border radius:** `var(--radius-lg)` (8px) for standard cards, `var(--radius-xl)` (12px) for feature cards
- **Border:** 1px solid `var(--border)` — subtle, consistent
- **Gap between cards:** `var(--space-4)` (16px)
- **Card heading to body:** `var(--space-2)` (8px)
- **Card body to footer/actions:** `var(--space-4)` (16px) or `margin-top: auto` if actions are pushed to bottom

### Responsive Layouts

Layouts should adapt fluidly across breakpoints. Do not design "mobile" and "desktop" as two separate things — design one system that flexes.

**Sidebar layout responsive behavior:**

| Breakpoint | Layout |
|------------|--------|
| < 768px (mobile) | Single column, sidebar becomes hamburger or bottom nav |
| 768–1024px (tablet) | Sidebar collapses to icon-only rail (64px wide) |
| > 1024px (desktop) | Full sidebar (260px) + content area |

**Grid responsive behavior:**

| Breakpoint | Columns |
|------------|---------|
| < 640px (mobile) | 1 column |
| 640–1024px (tablet) | 2 columns |
| > 1024px (desktop) | 3–4 columns |

Use CSS Grid's `auto-fit` or `minmax()` for fluid grids that don't need explicit breakpoints: `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` — this automatically adjusts column count based on available width without any media queries.

### Alignment Rules

- **Left-align text** unless there is a compelling reason not to. Centered text is harder to read for paragraphs and should be reserved for single-line elements like hero headlines.
- **Vertically center** related elements in a flex row (icon + label in a button, avatar + name in a list item). Use `items-center`.
- **Top-align** in data-dense views (tables, grids of cards with varying content lengths). Bottom-aligned cards with different content heights look messy. Top-aligned cards look orderly.
- **Right-align** actions in card footers, table action columns, and navigation breadcrumbs (the "current" crumb). Right-align numerical data in tables for easy column scanning.
- **Center-align** hero content, modal content, empty state content, and confirmation dialogs — elements that are focal points.

---

## Typography

Typography is the voice of your interface. It carries the personality, establishes the hierarchy, and determines the readability of every word on screen. Poor typography makes even a great layout feel generic. Great typography elevates a simple layout into something memorable.

### Heading Hierarchy

Use a consistent type scale with a ratio of approximately 1.25 (major third). Every heading level should be visually distinct from its neighbors.

| Level | Size | Weight | Line Height | Use |
|-------|------|--------|-------------|-----|
| H1 | 32–40px | Semibold (600) | 1.1–1.2 | Page titles, hero headlines |
| H2 | 24–28px | Semibold (600) | 1.2–1.3 | Section headings |
| H3 | 20–22px | Medium (500) | 1.3 | Subsection headings, card titles |
| H4 | 16–18px | Medium (500) | 1.4 | Group labels, small section titles |
| Body | 14–16px | Regular (400) | 1.5–1.6 | Paragraphs, descriptions |
| Small | 12–13px | Regular (400) | 1.4–1.5 | Captions, metadata, helper text |
| Tiny | 11px | Medium (500) | 1.4 | Labels, badges, overline text |

Never skip heading levels. An H1 followed by an H3 breaks the hierarchy and confuses screen readers. If you need a visual level between H2 and H4, use H3 with different styling — do not invent heading levels.

Reduce heading sizes on mobile. An H1 at 40px on desktop is fine, but on a 375px screen it forces awkward line breaks. Scale down by approximately 20–25% on mobile: `clamp(28px, 5vw, 40px)` handles this responsively without explicit breakpoints.

### Readable Line Heights

Line height (leading) directly affects readability. Too tight and lines blur together. Too loose and the eye loses its place.

- **Headings:** 1.1–1.25 — tight leading because headings are large and have few lines
- **Body text:** 1.5–1.6 — generous leading for sustained reading
- **Small text:** 1.4–1.5 — slightly tighter because small text has more natural visual spacing
- **Tables and dense data:** 1.3–1.4 — tighter to pack more information without looking cramped

Paragraph spacing (margin-bottom) should be `0.75em` — or roughly equal to the line height. This creates a visual rhythm where paragraph gaps match line gaps, making the text block feel rhythmic rather than random.

### Text Weights

Use weight sparingly for maximum impact. If everything is bold, nothing is bold. Your type scale should have a maximum of three weights in active use.

- **Regular (400)** for body text, descriptions, most content
- **Medium (500)** for labels, small headings, emphasis within body text
- **Semibold (600)** for primary headings, important actions, navigation items
- **Bold (700)** rarely — for critical numbers, primary button text, or emergency states only

Never use light (300) or thin (100) weights for UI text. They are fashionable in marketing materials but illegible at UI sizes (12–14px) on non-retina screens. Save them for large display text (40px+) if you use them at all.

### Body Spacing

Body text should breathe. A wall of text is an unreadable wall of text. Break content into short paragraphs (2–4 sentences), use subheadings for long sections, and employ lists for sequential or parallel information.

- **Paragraph to paragraph:** `var(--space-4)` (16px)
- **Paragraph to subheading:** `var(--space-8)` (32px) above, `var(--space-2)` (8px) below
- **Within a form group:** `var(--space-2)` (8px) between label and input, `var(--space-4)` (16px) between groups
- **List item to list item:** `var(--space-2)` (8px) for tight lists, `var(--space-3)` (12px) for comfortable lists

### When to Use Emphasis

Emphasis (italic, underline, color change) should be rare and purposeful. Overused, it becomes noise.

- **Bold** for key terms on first mention, important labels, and data values in running text ("Your plan renews on **March 15**")
- **Color** for interactive elements (links, buttons) and status indicators. Never use color as the sole indicator — always pair with an icon or text label
- **Italic** for occasional parenthetical asides, technical terms on first use, and quoted text. Italic body text is hard to read — use sparingly
- **Underline** for links only. Never underline for emphasis — it is confused with links
- **Uppercase** for overline labels ("SECTION TITLE"), category tags, and eyebrow text. Use letter-spacing of 0.05–0.1em for uppercase text to improve readability

### Avoid Walls of Text

No UI text block should exceed 3–4 sentences without a visual break. If you find yourself writing a paragraph longer than that, ask: can this be a bulleted list? A table? A collapsed "Learn more" section? A tooltip?

Users scan, they do not read. Long-form text has its place — documentation, blog posts, terms of service — but in a product interface, text is a tool for clarity, not a content dump. Every sentence should earn its place by helping the user understand, decide, or act.

---

## Color System

Color in a premium interface is systematic, not decorative. Every color has a job — to indicate state, establish hierarchy, encode category, or provide meaning. Arbitrary color use ("let's make this card blue because it looks nice") is the hallmark of a templated design.

### Semantic Colors

Build your palette around semantic roles, not arbitrary choices. Each color has a defined purpose and is used consistently for that purpose across the entire product.

**Primary:** The brand color. Used for primary actions, active navigation items, selected states, and key brand moments. Should be distinctive but not overwhelming. A single primary color used with restraint is more powerful than a rainbow palette.

**Secondary:** A complementary color for secondary actions, alternative selections, and supporting UI elements. Should have sufficient contrast with primary while feeling like it belongs to the same design language.

**Success (green):** Positive outcomes — completed actions, successful states, healthy metrics, confirmed changes. Use a warm, muted green (not neon) — think `#22c55e` in light mode, `#4ade80` in dark mode. Avoid pure green (`#00ff00`) — it looks radioactive.

**Warning (amber/yellow):** Caution states — approaching limits, expiring sessions, non-blocking issues, potential problems. Use amber (`#f59e0b` light, `#fbbf24` dark) — it is visible without being alarming. Reserve red for actual danger.

**Danger (red):** Destructive actions and error states — delete, remove, critical errors, data loss, security alerts. Red should feel urgent but not panicked. Use `#ef4444` light mode, `#f87171` dark mode — saturated enough to read, not so saturated it vibrates.

**Muted (gray):** Backgrounds, borders, disabled states, secondary text, placeholders. A neutral gray scale that adapts to light and dark modes without being identical in both. Muted is the workhorse of your palette — most of your UI will be muted tones.

### Borders

Borders define edges and create visual containment. Use them sparingly — overusing borders makes an interface feel rigid and cluttered.

- **Default border:** 1px solid with a muted color — `var(--border)`, typically 10–15% opacity of the text color
- **Strong border:** 1px solid with a slightly more opaque muted color — for focused inputs, active cards, selected items
- **No border:** For most cards, panels, and sections — use background color contrast or shadow instead. Borders between every element create visual noise
- **Top border only:** For dividing sections within a card or panel — cleaner than a full border box
- **Bottom border:** For table rows and list items — creates a clean separation without boxing each item

### Backgrounds

Background hierarchy creates depth without explicit borders.

```
Layer 0 (base):    var(--bg)           — Page background
Layer 1 (raised):  var(--bg-elevated)  — Cards, panels, popovers
Layer 2 (overlay): var(--bg-overlay)  — Modals, sheets, dropdowns
Layer 3 (spotlight): var(--bg-spotlight) — Focused modals, full-screen takeovers
```

Each layer should be slightly lighter (light mode) or slightly darker (dark mode) than the one below it. The difference between layers should be subtle — enough to perceive depth, not enough to create harsh contrast. Typically 2–5% lightness difference between adjacent layers.

### Dark Mode and Light Mode

Design both modes simultaneously, not one after the other. Dark mode is not "invert all colors" — it is a complete color system that needs its own palette tuning.

**Dark mode principles:**
- Do not use pure black (`#000000`) as the background — use `#09090b` or `#111827`. Pure black creates harsh contrast that causes eye strain
- Reduce saturation in dark mode — colors that look vibrant in light mode look neon in dark mode. Desaturate by 10–20%
- Raise background layers slightly toward gray — the layer hierarchy should still work but with less contrast between layers
- Increase border opacity — borders that are barely visible in light mode need to be slightly more visible in dark mode to define edges
- Test on actual dark mode, not with an inversion tool. Colors behave differently on different display technologies

**Light mode principles:**
- Use warm whites for backgrounds (`#fafafa`, `#f8fafc`) — pure white (`#ffffff`) is harsh and creates too much contrast with dark text
- Shadows are visible and useful in light mode — use them for elevation
- Saturated colors pop on light backgrounds, so you can be more vibrant with accents
- Keep the background layer subtle — the content should be the focus, not the background surface

### Accent Colors

Accents are optional and should be used sparingly. They add personality without disrupting the semantic color system. Use accents for: highlights in data visualization, decorative gradients, feature callouts, and branded moments.

Limit yourself to 1–2 accent colors beyond the primary. Too many accents fragment the visual identity. If you find yourself reaching for a third accent, you probably need a more disciplined primary palette.

### Contrast Ratios

WCAG 2.2 AA requires:
- **Normal text (< 18px, < 14px bold):** 4.5:1 contrast ratio minimum
- **Large text (≥ 18px or ≥ 14px bold):** 3:1 contrast ratio minimum
- **UI components (borders, icons, focus indicators):** 3:1 contrast ratio minimum

In practice, aim higher than the minimum. 4.5:1 is the floor, not the target. Text at 7:1+ is comfortable for extended reading. Use tools like Stark, Colour Contrast Analyser, or the Chrome DevTools contrast checker during development.

**Common contrast failures:**
- Light gray text (`#9ca3af`) on white background — fails 4.5:1. Use `#6b7280` or darker
- White text on light primary colors (baby blue, mint green) — often fails. Darken the background or darken the text
- Placeholder text in inputs — often fails because placeholder color is too light. Use at least `#9ca3af` (3.97:1 on white) or `#6b7280` (5.89:1 on white)

---

## Components

Components are the building blocks of your interface. Each component should be self-contained, reusable, and consistent with the design system. Great components encapsulate behavior, not just appearance — a button component should handle loading states, disabled states, icon positioning, and size variants, not just look like a button.

### Navigation Bars

The navigation bar is the user's primary orientation tool. It should answer two questions at a glance: "Where am I?" and "Where can I go?"

- **Top navigation (horizontal):** Use for products with 5–8 top-level destinations. Logo left, nav items center, actions (search, notifications, profile) right. The active item should be visually distinct — underline, background highlight, or weight change
- **Sidebar navigation (vertical):** Use for products with 8+ top-level destinations or nested hierarchies. Sidebar is fixed on desktop, collapses to hamburger on mobile. Group related items under section headers. Icons are optional but recommended — they speed scanning
- **Breadcrumb navigation:** Use for hierarchical content (file browsers, deep page structures). Place below the main nav, above the page title. Current item is plain text, not a link. Use chevron separators, not slashes

### Sidebars

Sidebars provide persistent context — navigation, filters, configuration panels. They should be visually distinct from the main content area, either through background contrast, a border, or both.

- **Fixed width:** 240–280px on desktop. Wider sidebars waste content space; narrower ones truncate labels
- **Collapsible:** Support a collapsed state (48–64px icon-only rail) for users who want more content space. Show icons in collapsed mode, reveal labels in full mode. Animate the transition
- **On mobile:** Convert to a sheet/drawer that slides in from the left, triggered by a hamburger button. Overlay on top of content with a backdrop. Close on backdrop click, Escape key, or selection

### Cards

Cards group related information into scannable, manipulable units. They are the most overused and under-thought component in modern UIs. Every card should earn its existence by containing information that benefits from visual containment.

- **Padding:** 16px (compact) to 24px (standard)
- **Border radius:** 8px (standard) to 12px (feature)
- **Border:** 1px solid `var(--border)` or no border with background contrast and subtle shadow
- **Shadow:** Subtle elevation — `0 1px 2px rgba(0,0,0,0.05)` for resting, `0 4px 12px rgba(0,0,0,0.1)` for hovered/lifted
- **Interactive cards:** Add hover state (slight lift, border highlight), cursor pointer, focus-visible ring, and keyboard activation (Enter/Space)
- **Card content hierarchy:** Title (H3/H4), description (body text), metadata (small/muted), actions (buttons/links in footer)

### Dashboards

Dashboards are information-dense views that surface the most important data and actions. A great dashboard answers the user's most frequent question without requiring them to click anything. (Full dashboard design principles are covered in the Dashboard Design section.)

Key component patterns for dashboards:
- **Metric cards:** Large number, label, trend indicator, sparkline
- **Activity feeds:** Chronological list of recent events with timestamps and actors
- **Quick action panels:** Grouped buttons or links for common tasks
- **Status indicators:** Colored badges, progress bars, health checks

### Tables

Tables are for structured data that benefits from sorting, filtering, and comparison. They are dense by nature — make them scannable.

- **Row height:** 40–48px (compact), 56–64px (comfortable). Consistent throughout
- **Column alignment:** Text left-aligned, numbers right-aligned, actions right-aligned, boolean centered
- **Sticky header:** Column headers stay visible on scroll
- **Row hover:** Subtle background highlight to indicate interactivity
- **Row selection:** Checkbox column with header checkbox for select-all
- **Empty state:** When table has no data, show a meaningful empty state (covered in Empty States section), not just "No results"
- **Horizontal scroll on mobile:** Tables do not reflow on mobile. Allow horizontal scroll with sticky first column if possible

### Forms

Forms are where users convert intent into action. A confusing form is the fastest way to lose a user. Every field, label, validation message, and submit button should reduce friction, not add it. (Full form design is covered in the Forms section.)

### Dialogs and Modals

Modals interrupt the user's workflow. Use them sparingly — only for actions that genuinely require the user's focused attention before proceeding: confirmations, destructive actions, and focused input (create, rename).

- **Size:** Small (400px), Medium (520px), Large (640px). Three sizes, no arbitrary widths
- **Centered on screen** with a semi-transparent backdrop
- **Close on:** Escape key, backdrop click, close button (top-right X)
- **Focus trap:** Tab should cycle within the modal, not escape to the page behind it
- **Auto-focus:** The first interactive element (usually an input or primary action) should receive focus when the modal opens
- **Motion:** Fade in the backdrop (150ms), scale+fade in the modal (200ms). Reverse on close

### Sheets and Drawers

Sheets are panels that slide in from an edge of the screen. Use them for: detail views, edit panels, configuration, and contextual actions that benefit from showing the main content alongside the sheet.

- **Edge:** Right side (most common), left side (for navigation/filter panels), bottom (on mobile)
- **Width:** 50% of viewport on desktop (capped at 640px), 90% on tablet, 100% on mobile
- **Close on:** Escape key, close button, clicking outside (optional — sometimes you want the sheet to persist)
- **Content:** Scrollable independently from the main page

### Accordions

Accordions collapse and expand sections of content. Use them for FAQ pages, settings panels with multiple categories, and any content that benefits from showing one section at a time.

- **One-at-a-time or multiple:** Decide which behavior your product needs and be consistent. One-at-a-time focuses attention; multiple allows comparison
- **Animation:** Smooth height transition (200–300ms). Use `grid-template-rows: 0fr → 1fr` trick for smooth CSS-only animation
- **Chevron rotation:** 90deg rotation indicates expand/collapse state
- **Keyboard:** Enter/Space to toggle, arrow keys to navigate between items

### Tabs

Tabs switch between views within the same context. Use them for 2–5 related views where the user needs to switch frequently.

- **Position:** Top of the content area (most common) or left sidebar (for many tabs with long labels)
- **Active state:** Bottom border indicator or background highlight — visually distinct from inactive tabs
- **Content:** Each tab panel renders independently. Do not hide/show — mount/unmount or lazy-load to avoid rendering hidden content
- **Keyboard:** Arrow keys to switch tabs, Tab to enter the tab panel content

### Dropdowns

Dropdowns present a list of options from a trigger element. Use them for actions menus, selection menus, and context menus.

- **Position:** Below the trigger, aligned left (or right if there is not enough space). Flip to above the trigger if near the bottom of the viewport
- **Close on:** Selection, Escape key, click outside, Tab blur
- **Scroll:** Max-height with internal scroll if there are many items (cap at 300px visible, show scroll for more)
- **Keyboard:** Arrow keys to navigate, Enter to select, Escape to close, type-ahead for filtering
- **Grouping:** Group related items with section headers or dividers

### Toasts and Notifications

Toasts provide feedback for actions that do not require user interaction. They appear, persist briefly, and dismiss automatically.

- **Position:** Bottom-right (most common), bottom-center (for important toasts), top-right (for notifications that should not be missed)
- **Duration:** 3–5 seconds for success, 5–8 seconds for info, persistent (with dismiss button) for errors that need attention
- **Types:** Success (green checkmark), Error (red), Warning (amber), Info (blue)
- **Animation:** Slide in from edge (200ms), slide out on dismiss (200ms)
- **Stacking:** Multiple toasts stack vertically with 8px gap. Limit to 3–5 visible; dismiss oldest when limit exceeded

### Search

Search is how users find things. Make it fast, obvious, and forgiving.

- **Global search:** Cmd+K / Ctrl+K shortcut that opens a command palette. This is the premium pattern — covered in Command Palette
- **Inline search:** Within a table, list, or content area. Shows results as the user types (debounced at 150–300ms). Clear button (X) to reset
- **Search input:** Placeholder text should say what is searchable — "Search projects..." not just "Search." Show a search icon on the left
- **Results:** Highlight matching text. Show context around the match. Group by type if results span multiple categories

### Command Palette (Cmd+K)

The command palette is the power user's best friend. It provides keyboard-driven access to any action, page, or setting in the product. Inspired by Spotlight, Raycast, and VS Code's command palette.

- **Trigger:** Cmd+K (macOS), Ctrl+K (Windows/Linux). Show the shortcut in a hint near the trigger button
- **Overlay:** Centered modal with search input, matching the full viewport width (capped at 640px)
- **Behavior:** As the user types, filter actions/pages in real-time. Group results by category. Show keyboard navigation hints (arrows to navigate, Enter to select)
- **Content types:** Actions (create, delete, export), Navigation (pages, settings), Recent items, Help links
- **Empty state:** "No results found" with a suggestion to try different terms or browse all actions

### Profile Pages

Profile pages show user/account information. Keep them focused and actionable.

- **Header:** Avatar (large, 80px), name, role/username, joined date or status
- **Tabs for sections:** Activity, Projects, Settings — do not show everything at once
- **Editable:** Inline editing (click to edit) for most fields. Full form modal only for complex changes (password, email)
- **Danger zone:** Destructive account actions (delete account, leave team) should be separated from other settings, visually distinct (red section), and require re-authentication

### Authentication Pages

Auth pages (login, signup, forgot password) should be clean, focused, and reassuring. No distractions — the user has one job: authenticate.

- **Centered layout:** Single column, vertically centered. Logo at top, form in center, helper links at bottom
- **Social login:** Prominent if offered — "Continue with Google/GitHub" buttons above email login. These are the default for most users
- **Minimal fields:** Email and password only for login. Do not add optional fields during signup that can be collected later
- **Trust signals:** Brief security note or privacy link. "Your data is encrypted" or "By signing up, you agree to our Terms"
- **Visual:** Can be on a split-screen layout with marketing copy on the left and form on the right — but the form side should still work standalone on mobile

### Settings Pages

Settings pages are where users configure the product. They tend to become dumping grounds — resist this with disciplined grouping, search, and progressive disclosure.

- **Group by category:** Account, Notifications, Appearance, Billing, Integrations, API, Danger Zone
- **Sidebar navigation on desktop** for quick jumping between groups. Stack on mobile with a select dropdown or accordion
- **Search settings:** If there are 20+ settings, add a search/filter input at the top
- **Immediate save:** Save changes immediately on toggle/select change, not on form submit. Show a brief "Saved" toast. For text fields, debounce save at 500ms after the user stops typing
- **Danger zone:** Separate section at the bottom, visually distinct (red border or background), with confirmation dialogs for destructive actions

### Pricing Pages

Pricing pages are marketing tools, not just tables. They should guide the user toward the recommended plan.

- **3–4 tiers maximum.** Any more is overwhelming. Label clearly: Free, Pro, Enterprise
- **Highlight recommended tier:** Use a "Most Popular" badge, border highlight, or slight scale increase. The recommended tier should be in the center of the row
- **Feature comparison table below:** Checkmarks and X marks for each feature per tier. Highlight the recommended tier's column
- **CTA per tier:** Clear button ("Start free trial," "Contact sales") with distinct styling for the recommended tier
- **Monthly/Annual toggle:** Default to annual (shows the savings). Show both prices with the annual discount

### Landing Pages

Landing pages sell the product. Every element should serve the conversion goal. (Full SaaS landing page design is covered in the SaaS Landing Pages section.)

### Documentation Pages

Documentation pages deliver information. Readability, navigation, and search are the priorities. (Full documentation page design is covered in the SDK & Developer Documentation Pages section.)

### Empty States

Empty states appear when there is no data. They should be helpful, not dead ends. (Full empty state design is covered in the Empty States, Onboarding & Loading Skeletons section.)

### Loading States

Loading states maintain perceived performance and user confidence during data fetches. (Full loading state design is covered in the Empty States, Onboarding & Loading Skeletons section.)

### Error States

Error states communicate failures and guide recovery. They should be clear about what happened and what to do next.

- **Inline errors:** Appear below the relevant field in forms. Red text, specific message. "Password must be at least 8 characters" not "Invalid input"
- **Banner errors:** Appear at the top of the page for global errors (network failure, permission denied). Dismissible. Include an action: "Retry," "Sign in again," "Contact support"
- **404 pages:** Friendly, on-brand. Brief explanation, link to dashboard/home, search box. Not a plain "Not found"
- **5xx pages:** Apologize briefly, suggest retrying, link to status page if available. The user did nothing wrong — do not imply they did

### Skeleton Loaders

Skeleton loaders are gray placeholder shapes that mimic the layout of the content being loaded. They reduce perceived latency by showing the user what is coming.

- **Shape:** Match the final content shape — text lines, card outlines, avatar circles, image rectangles
- **Animation:** Subtle shimmer effect (left to right, 1.5–2s loop) using a gradient mask or opacity pulse
- **Duration:** Show for at least 500ms to avoid flashing. If data loads faster, hold the skeleton briefly. If data loads slower, consider a loading spinner after 3–5 seconds
- **Widths:** Use varied widths (80%, 60%, 40%) for text lines to look organic, not uniform

---

## React Architecture

Component architecture determines how maintainable, testable, and performant your UI is. A well-architected React codebase is a joy to work with; a poorly structured one is a fragile mess that breaks when you breathe on it.

### Reusable Components

Build small, focused components that do one thing well. The best components are like LEGO bricks — composable, predictable, and reusable across contexts.

**Component design rules:**
- Each component should have a single responsibility. A `UserAvatar` component renders an avatar. It does not fetch user data, it does not handle navigation to the user profile, and it does not manage the user's online status. It receives a `src` and `name` as props and renders them
- Components should receive data through props, not fetch it internally (except for truly self-contained components). This makes them testable and reusable
- Avoid deeply nested prop drilling. If you are passing props through 3+ levels, use Context or a state management solution
- Design components for composition, not configuration. A `<Card>` component with `<Card.Header>`, `<Card.Body>`, `<Card.Footer>` is more flexible than a `<Card title="" body="" footer="">` with string props

### Composition

Composition is the React way of building complex UIs from simple pieces. Prefer composition over inheritance and composition over configuration.

```tsx
// Good: Composition
<Card>
  <CardHeader>
    <CardTitle>System Status</CardTitle>
    <CardDescription>All services operational</CardDescription>
  </CardHeader>
  <CardContent>
    <StatusList services={services} />
  </CardContent>
  <CardFooter>
    <Button variant="ghost">View Details</Button>
  </CardFooter>
</Card>

// Avoid: Configuration prop explosion
<Card
  title="System Status"
  description="All services operational"
  content={<StatusList services={services} />}
  footer={<Button variant="ghost">View Details</Button>}
  showHeader={true}
  padded={true}
  border={true}
/>
```

### Hooks

Custom hooks encapsulate reusable logic. They are how you share stateful behavior between components without prop drilling or coupling.

**Common custom hooks for Mai's UI:**
- `useWebSocket()` — manages WebSocket connection, reconnection, message buffering
- `useVoice()` — manages speech recognition state, transcription, and TTS
- `useTheme()` — manages light/dark mode toggle and persistence
- `useKeyboardShortcut()` — registers global keyboard shortcuts (Cmd+K for command palette)
- `useMediaQuery()` — reactive breakpoint detection
- `useDebounce()` — debounces rapid value changes (search input, auto-save)

**Rules for hooks:**
- Always start with `use`. This is how React and linting tools identify them
- Call hooks only at the top level of a component, never inside conditions, loops, or nested functions
- Return stable references — memoize values returned from hooks to prevent unnecessary re-renders
- Keep hooks small and focused. A hook that does 10 things is 10 hooks waiting to be extracted

### Folder Organization

Organize components by feature, not by type. Feature-based organization groups all related components, hooks, utilities, and types together.

```
src/
  components/          # Shared, reusable components
    ui/                 # Primitive UI components (Button, Card, Input)
      button.tsx
      card.tsx
      dialog.tsx
      toast.tsx
    layout/             # Layout components (Navbar, Sidebar, Footer)
      navbar.tsx
      sidebar.tsx
    charts/             # Data visualization components
      line-chart.tsx
      metric-card.tsx

  features/             # Feature modules
    chat/               # Chat interface
      components/       # Chat-specific components
        message-list.tsx
        message-input.tsx
        chat-header.tsx
      hooks/            # Chat-specific hooks
        use-chat.ts
        use-messages.ts
      types.ts          # Chat-specific types

    dashboard/          # Dashboard interface
      components/
      hooks/
      types.ts

    settings/           # Settings pages
      components/
      hooks/
      types.ts
```

### State Management

Use the simplest state management that solves your problem. Not every app needs Redux.

**State management hierarchy:**
1. **Local state (`useState`):** For state that only one component needs (form inputs, toggle states, selected tab)
2. **Lifted state:** For state shared between parent and child components (open/closed state for a modal controlled by a parent button)
3. **Context (`useContext`):** For state shared across many components at different nesting levels (theme, authentication, locale)
4. **External state (Zustand, Jotai):** For complex state that is accessed from many unrelated components (WebSocket messages, voice state, agent loop state)
5. **Server state (TanStack Query / SWR):** For data fetched from an API. Handles caching, revalidation, loading, and error states automatically

For Mai specifically, Zustand is the best fit for client-side state — it is lightweight (1KB), has no boilerplate, and works well with WebSocket streams. Use TanStack Query if Mai starts fetching data from external APIs.

### Naming Conventions

Consistent naming speeds development and reduces cognitive load when navigating a codebase.

- **Components:** PascalCase — `MessageList`, `StatusBar`, `VoiceIndicator`
- **Hooks:** camelCase starting with `use` — `useChatMessages`, `useWebSocket`
- **Utilities:** camelCase — `formatTimestamp`, `debounce`, `truncate`
- **Constants:** UPPER_SNAKE_CASE — `MAX_MESSAGE_LENGTH`, `WS_RECONNECT_DELAY`
- **Types/Interfaces:** PascalCase — `ChatMessage`, `WebSocketEvent`, `AgentState`
- **CSS classes:** kebab-case with BEM or utility-first — `message-bubble`, `message-bubble--sent`, or just Tailwind utilities
- **Files:** kebab-case for utilities, PascalCase for component files — `format-timestamp.ts`, `MessageList.tsx`
- **Events:** camelCase — `onMessage`, `onVoiceStart`, `onActionComplete`

---

## Tailwind CSS

Tailwind CSS is the utility-first framework that enables rapid, consistent UI development. When used well, it eliminates the gap between design system and implementation — every design token is a utility class, and every utility class is a design token.

### Utility-First Philosophy

Tailwind's core idea: apply styles directly in markup using single-purpose utility classes, rather than naming CSS classes and applying styles indirectly. This makes the relationship between markup and appearance explicit and discoverable.

```html
<!-- Good: Clear what this looks like from the markup -->
<button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
  Send Message
</button>

<!-- Avoid: Requires context-switching to CSS file to understand -->
<button class="btn-primary">
  Send Message
</button>
```

For Mai's UI, use Tailwind for all styling. The utility-first approach keeps styles co-located with components, reduces CSS file bloat, and makes it easy to maintain consistency.

### Variants

Use Tailwind variants for state and responsive styling. Variants are applied with colon prefixes.

```html
<!-- State variants -->
<button class="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed">

<!-- Dark mode variant -->
<div class="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">

<!-- Breakpoint variants -->
<div class="grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
```

### Reusable Utility Patterns

For patterns repeated across components, extract them using `@apply` in CSS files or create component wrappers. But prefer component wrappers over `@apply` — components can encapsulate behavior, not just styles.

```tsx
// Good: Component wrapper
function Button({ children, variant = 'primary', size = 'md', ...props }) {
  const base = 'inline-flex items-center font-medium rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-offset-2';
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100',
    ghost: 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]}`} {...props}>
      {children}
    </button>
  );
}
```

### Responsive Utilities

Tailwind's responsive utilities map directly to the breakpoints defined in the Responsive Design section.

- Mobile is the base (no prefix)
- Tablet: `md:` prefix (768px+)
- Desktop: `lg:` prefix (1024px+)
- Large desktop: `xl:` prefix (1280px+)

### Dark Mode

Use Tailwind's `dark:` variant with the `class` strategy (toggle a `dark` class on the `<html>` element). This gives you full control over when dark mode activates.

```js
// In tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Mai's semantic color tokens
        mai: {
          bg: 'var(--bg)',
          'bg-elevated': 'var(--bg-elevated)',
          border: 'var(--border)',
          text: 'var(--text)',
          'text-muted': 'var(--text-muted)',
          primary: 'var(--primary)',
          accent: 'var(--accent)',
        }
      }
    }
  }
}
```

### Avoid Unnecessary Classes

Do not apply every utility to every element. Use Tailwind's defaults and only override when the default does not work. For example, if the global CSS sets a sensible default for body text, you do not need to add `text-zinc-900 dark:text-zinc-100` to every `<p>` tag. Use component-level classes to establish defaults and only add modifiers where they differ.

---

## Design Systems

A design system is the single source of truth for all visual decisions. It encodes your palette, typography, spacing, and component patterns into tokens and components that the entire UI references. Without a design system, consistency is accidental.

### Design Tokens

Design tokens are the atomic values that make up your visual language. They are the bridge between design decisions and code implementation.

**Color tokens:**
```css
:root {
  --color-primary: #6366f1;          /* Indigo — Mai's brand */
  --color-primary-hover: #4f46e5;
  --color-primary-muted: rgba(99, 102, 241, 0.1);
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-info: #3b82f6;
}

[data-theme="dark"] {
  --color-primary: #818cf8;
  --color-primary-hover: #6366f1;
  --color-success: #4ade80;
  --color-warning: #fbbf24;
  --color-danger: #f87171;
}
```

**Spacing tokens** (covered in Layout System):
```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

**Typography tokens:**
```css
:root {
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-display: 'Inter', system-ui, sans-serif;

  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.8125rem;  /* 13px */
  --text-base: 0.875rem; /* 14px */
  --text-lg: 1rem;       /* 16px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 1.875rem;  /* 30px */
}
```

### Radius Tokens

Consistent border-radius across the interface prevents the "patchwork" look where different elements have different rounding.

```css
:root {
  --radius-none: 0;
  --radius-sm: 4px;    /* Tags, small badges */
  --radius-md: 6px;    /* Buttons, inputs */
  --radius-lg: 8px;    /* Cards, panels */
  --radius-xl: 12px;   /* Feature cards, modals */
  --radius-2xl: 16px;  /* Hero elements */
  --radius-full: 9999px; /* Pills, circular avatars */
}
```

### Elevation (Shadows)

Elevation creates depth through shadows. Use a consistent shadow scale that maps to elevation levels.

```css
:root {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

[data-theme="dark"] {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
}
```

### Icons

Use a single icon set throughout the interface. Mixing icon sets (Font Awesome + Heroicons + Material) creates visual inconsistency.

- **Recommended for Mai:** Lucide icons — consistent 24px stroke width, lightweight, MIT license, tree-shakeable
- **Icon size:** 20px for inline icons (next to text), 16px for compact UI, 24px for standalone icons
- **Icon color:** Inherit from parent text color by default. Use semantic colors for status icons (green checkmark, red X, amber warning)
- **Never use icons without labels** for critical actions. Icons + labels > icons alone > labels alone

### Consistency Enforcement

Design tokens are useless if developers do not use them. Enforce consistency through:
- **ESLint rules** that flag hardcoded color values, spacing values, and font sizes in JSX
- **CSS custom properties** for all design decisions — never use raw values
- **Component libraries** that encapsulate tokens into reusable building blocks
- **Storybook or similar** to document and preview all components and their variants

---

## AI Product Design

Mai is an AI product, and AI products have unique UI challenges that traditional SaaS products do not. Users interact with an agent, not just a dashboard. The interface must convey intelligence, progress, and trust while managing the inherent uncertainty of AI responses.

### Chat Interfaces

The chat interface is Mai's primary interaction surface. It must feel fast, natural, and transparent.

**Message bubbles:**
- User messages right-aligned with a distinct background color (primary or primary-muted)
- AI messages left-aligned with a neutral background (elevated) or no background for longer responses
- Timestamps below each message, muted and small
- Clear visual separation between conversation turns

**Message types:**
- **Text:** Standard markdown rendering — bold, italic, code blocks, links
- **Code:** Syntax-highlighted code blocks with copy button and language label
- **Actions:** Show what Mai is doing — "Searching the web..." or "Running terminal command..." with inline progress indicators
- **Results:** Structured output — search results as cards, command output as code blocks, data as tables
- **Errors:** Clear, non-scary error messages with actionable next steps. "I couldn't reach the site. Want me to try again?"

**Input area:**
- Multi-line textarea that grows with content, not a fixed single-line input
- Send button (primary color, icon + text or icon only)
- Stop button to halt an in-progress response
- Keyboard shortcut: Enter to send, Shift+Enter for new line
- Character count for long inputs (optional)
- Attachment/support buttons: voice input toggle, file attach (future), context menu

### Agent Dashboards

An agent dashboard shows what Mai is doing, has done, and can do. It provides visibility into the agent's state and actions.

**State indicator:**
- Always-visible status badge: "Idle", "Thinking", "Processing", "Speaking"
- Color-coded: green (idle), amber (thinking), blue (processing), purple (speaking)
- Animated pulse or spinner when active

**Activity timeline:**
- Chronological log of agent actions — what was requested, what Mai did, what the result was
- Each action is a collapsible row: summary on one line, expanded to show full details
- Color-coded by action type: search (blue), terminal (amber), file read (green), error (red)
- Timestamps on each action

**Memory/context panel (future):**
- Shows what Mai "remembers" — semantic memory, recent conversation highlights
- Allows user to review, correct, or delete memories
- Gives users visibility into and control over the personalization system

### Reasoning Indicators

When Mai takes time to think or process, show the user what is happening. Never leave the user staring at a blank screen during processing.

- **Thinking state:** Animated dots ("Mai is thinking..."), typing indicator, or a subtle pulse animation
- **Action execution:** "Searching the web..." with a spinner, then "Found 5 results" with the results
- **Multi-step processing:** Progress indicator — "Step 1 of 3: Reading file..."
- **Streaming text:** Show AI responses as they stream in, character by character or chunk by chunk. This reduces perceived latency dramatically

### Task Execution Views

When Mai executes complex tasks (multi-step actions, long-running commands), provide a dedicated execution view.

- **Step-by-step progress:** Each step shows status (pending, running, completed, failed)
- **Live output:** Terminal output streams in real-time, not dumped all at once
- **Abort capability:** Clear "Stop" button to cancel execution at any time
- **Result summary:** After completion, show a concise summary of what happened and any outputs

### Memory Views

When Mai's adaptive memory system is implemented (the semantic + episodic memory discussed earlier), provide UI for:

- **Memory browser:** Browse what Mai has stored about the user — preferences, learned patterns, past conversations
- **Memory editing:** Allow users to correct or remove specific memories
- **Memory stats:** Show how many memories are stored, storage usage, retention period
- **Privacy controls:** Toggle what Mai is allowed to remember (conversations, preferences, actions)

### Execution History

A log of everything Mai has done. Think of it as an audit trail.

- **Filterable by date, action type, and status**
- **Searchable** — find specific past actions
- **Expandable** — click any entry for full details
- **Exportable** — download execution history as JSON/CSV

---

## SDK & Developer Documentation Pages

Mai's developer documentation should be clean, searchable, and navigable. Developers expect specific patterns from documentation sites — meet those expectations.

### API References

- **Left sidebar navigation** with all endpoints/methods grouped by resource
- **Endpoint pages** with: method badge (GET/POST/PUT/DELETE in color), URL, description, parameter table, response example, error codes
- **Try-it panel:** Interactive API explorer where developers can input parameters and see responses
- **Copy buttons** on all code examples and response bodies

### Quick Start

- **The first page new developers see.** It should get them to a working "Hello World" in under 5 minutes
- **Prerequisites:** Clear, minimal — what do they need before starting?
- **Installation:** One command or one step. Not a maze
- **Example code:** Complete, runnable, copy-pasteable. With comments explaining each line
- **Next steps:** Link to the most relevant next page (Authentication, API Reference, Examples)

### Authentication

- **Clear, step-by-step instructions** with screenshots or terminal output
- **Code examples** in multiple languages if applicable
- **Token management:** How to generate, refresh, and revoke tokens
- **Error handling:** What happens when auth fails, how to recover

### Code Blocks

- **Syntax highlighting** for all code examples — use Prism.js, Shiki, or similar
- **Language label** in the top-right corner ("TypeScript", "Python", "Bash")
- **Copy button** — single click to copy entire code block. Brief "Copied!" feedback
- **Line highlighting** — highlight specific lines when referenced in the documentation text
- **Tabs for multiple languages** — "TypeScript | Python | cURL" tabs above the code block

### Search

- **Global search** (Cmd+K) across all documentation
- **Instant results** as the user types, debounced at 150ms
- **Grouped by type:** Pages, API endpoints, Code examples, Blog posts
- **Keyboard navigation:** Arrow keys, Enter to select

### Versioning

- **Version selector** in the top navigation — "v2.0 | v1.0"
- **Banner on outdated versions:** "You are viewing documentation for v1.0. The latest version is v2.0."
- **Redirect from old URLs** to the equivalent page in the latest version

---

## SaaS Landing Pages

If Mai ever has a public-facing landing page, these principles apply. A landing page's job is conversion — every element should guide the visitor toward signing up, trying the demo, or learning more.

### Structure

1. **Hero section:** Headline (one sentence, clear value proposition), subheadline (2–3 sentences expanding on the headline), primary CTA button, secondary CTA link, optional hero image/demo. The headline should answer "What is this and why should I care?" in under 10 words
2. **Social proof:** Logos of companies/users, testimonials, metrics ("10,000+ active users"), or case studies. Place below the hero for immediate credibility
3. **Features section:** 3–6 key features, each with an icon, heading, and 2–3 sentence description. Use a grid layout — 3 columns on desktop, stacked on mobile. Do not list every feature — prioritize the ones that differentiate Mai
4. **How it works:** 3 steps maximum. "Connect → Configure → Command." Simple, visual, numbered
5. **Pricing:** If applicable. 3–4 tiers (see Pricing Pages in Components section)
6. **FAQ:** 5–8 common questions with expandable answers. Address objections — security, privacy, cost, limits
7. **Final CTA:** One last conversion opportunity at the bottom. "Ready to get started?" with the primary CTA button

### Design for Conversion

- **Single column, centered layout** for the hero and CTA sections. Multi-column grids for features and social proof
- **High contrast CTAs** — the primary button should be the most visually prominent element on the page. Use the primary color, large size (lg/xl), and a contrasting text color
- **Minimal navigation** — too many nav items give the user too many places to go instead of converting. Logo, Features, Pricing, Docs, Login/Sign Up
- **Fast loading** — optimize images, lazy-load below-the-fold content, minimize JavaScript. A landing page should load in under 2 seconds

---

## Empty States, Onboarding & Loading Skeletons

### Empty States

Empty states are moments of truth. They happen when the user first uses a feature, completes all tasks, filters to no results, or encounters an error. A great empty state turns a dead end into a starting point.

**Principles:**
- **Illustration or icon:** A simple, on-brand illustration (not a stock photo) that conveys the mood — friendly for first-use, celebratory for completed tasks, empathetic for errors
- **Headline:** A concise, human-readable title — "No conversations yet" not "Empty state"
- **Description:** 1–2 sentences explaining why this is empty and what to do next — "Start a conversation with Mai by typing a message below"
- **Action button:** The primary next step — "Start a conversation," "Create your first project," "Run a search"
- **Secondary action:** An optional link — "Learn more" or "Watch tutorial"

**Empty state types:**
- **First use:** Welcome message, get-started action, optional tutorial link
- **No results:** "No results found for 'query.' Try different keywords or clear filters."
- **No data yet:** "No activity yet. Actions will appear here as you use Mai."
- **All clear:** "You're all caught up! No pending tasks." (Celebratory tone)
- **Error/empty:** "Unable to load data. Check your connection and try again." With retry button.

### Onboarding Flows

Onboarding teaches the user how to use the product without overwhelming them. For Mai, onboarding should be minimal and contextual.

- **Progressive onboarding:** Teach one concept at a time, when the user needs it. Do not show a 5-step tutorial upfront — show step 1 when the user first opens chat, step 2 when they first use voice, step 3 when they first run a command
- **Tooltips and highlights:** Draw attention to specific UI elements with brief tooltips. "Click here to search" with an arrow pointing to the search icon. Dismiss on click or after 3 seconds
- **Skip option:** Always provide a way to skip the onboarding. Power users will skip; new users will follow
- **Completion acknowledgment:** Brief celebration when onboarding is complete — "You're all set! Start talking to Mai."

### Loading Skeletons

Skeletons are the most important loading pattern. They reduce perceived latency and prevent layout shifts.

**Implementation pattern:**
```html
<!-- Text skeleton line -->
<div class="animate-pulse">
  <div class="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4 mb-2"></div>
  <div class="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2"></div>
</div>

<!-- Card skeleton -->
<div class="animate-pulse rounded-lg border border-zinc-200 dark:border-zinc-700 p-4">
  <div class="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-2/3 mb-3"></div>
  <div class="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-full mb-2"></div>
  <div class="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-4/5"></div>
</div>

<!-- Avatar + text skeleton -->
<div class="flex items-center gap-3 animate-pulse">
  <div class="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700"></div>
  <div class="flex-1 space-y-2">
    <div class="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/3"></div>
    <div class="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-2/3"></div>
  </div>
</div>
```

**Shimmer animation (advanced):**
```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-elevated) 25%,
    var(--shimmer) 50%,
    var(--bg-elevated) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

---

## Charts, Timelines, Kanban Boards & Calendars

### Charts

Charts visualize quantitative data. Use the right chart type for the data relationship you are showing.

- **Line charts:** Trends over time — CPU usage, request volume, error rate. Show time on X axis, value on Y axis
- **Bar charts:** Comparisons between categories — requests by endpoint, errors by type. Horizontal for long labels, vertical for time series
- **Area charts:** Cumulative data over time — total requests stacked by status. Fill the area under the line
- **Pie/donut charts:** Part-to-whole relationships — resource allocation, error distribution by type. Limit to 5–7 segments. Donut preferred (easier to read)
- **Sparklines:** Miniature trends — embed in metric cards, tables, and dashboards. No axes, no labels — just the trend line

**Chart principles:**
- Label axes clearly. Units matter — "Requests (per min)" not just "Requests"
- Use color to encode categories, not decoration. A consistent color per category across all charts
- Interactive: hover for tooltips, click for drill-down. Charts that cannot be interacted with are frustrating
- Responsive: scale down gracefully on mobile. Consider switching to stacked bar from grouped bar on narrow screens
- For Mai specifically, use lightweight chart libraries — Chart.js for simple charts, or Recharts if using React

### Timelines

Timelines show events in chronological order. Use them for activity logs, execution history, and conversation history.

- **Vertical timeline:** Events flow top-to-bottom. Each event has: a timestamp, a description, an optional status icon, and an optional detail section (expandable)
- **Connecting line:** A vertical line connecting events creates visual continuity. Use a muted color (border color)
- **Status dots:** Small colored circles on the timeline — green (success), red (error), amber (warning), blue (info), gray (pending)
- **Expandable entries:** Click to reveal full details, command output, or error messages. Keeps the timeline scannable at the collapsed level

### Kanban Boards

Kanban boards show tasks organized by status columns (To Do, In Progress, Done).

- **Columns:** Fixed width (280–320px) with horizontal scroll for more columns. Clear header with column name and task count
- **Cards:** Brief title, optional tags, optional assignee avatar, optional due date
- **Drag and drop:** Drag cards between columns to change status. Use a library like dnd-kit or react-beautiful-dnd
- **Limit WIP:** Show a maximum item count per column (optional). Color the column red when over limit
- **Empty column:** "No tasks here" with a dashed border drop zone

### Calendars

Calendar views show events by date. Use them for scheduling, deadline tracking, and resource planning.

- **Month view:** Grid of days. Current day highlighted. Events shown as colored dots or short labels. Click day to see events
- **Week view:** 7-column grid with time slots. Events as positioned blocks spanning their duration. Scrollable vertically
- **Mini calendar:** Small month view for date picking, typically in a sidebar. No event detail — just dots for days with events

---

## shadcn/ui Conventions

shadcn/ui is the component library philosophy that Mai's UI should follow. It is not a dependency — it is a collection of copy-paste components built on Radix UI primitives and Tailwind CSS that you own and control.

### Core Principles

- **Composable:** Components are built by composing smaller primitives. `<Dialog>` is composed of `<DialogTrigger>`, `<DialogContent>`, `<DialogHeader>`, etc.
- **Accessible:** Built on Radix UI, which provides full keyboard navigation, screen reader support, and ARIA compliance out of the box
- **Styled with Tailwind:** All styling is via Tailwind utility classes. Override by passing className props
- **You own the code:** Copy components into your project, modify them freely. No dependency updates to worry about

### Component Variants Pattern

Use `cva` (class-variance-authority) for type-safe component variants:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-transparent hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
```

### Key shadcn/ui Components for Mai

| Component | Use in Mai |
|-----------|-----------|
| `Button` | Send, Stop, Approve, Reject, Settings actions |
| `Input` | Chat message input, search, command palette |
| `Textarea` | Multi-line chat input |
| `Card` | Metric cards, action cards, result cards |
| `Dialog` | Confirmations, settings modals, error details |
| `Sheet` | Side panels for memory view, execution history, settings |
| `Tabs` | Chat/Settings/History tabs, documentation navigation |
| `Toast` | Action feedback, save confirmations, error alerts |
| `Dropdown` | Action menus, context menus, settings selectors |
| `ScrollArea` | Message list, activity feed, log viewer |
| `Separator` | Visual dividers between sections |
| `Badge` | Status indicators, action type labels, counts |
| `Skeleton` | Loading states for messages, metrics, cards |
| `Tooltip` | Icon button labels, keyboard shortcut hints |
| `Command` | Command palette (Cmd+K), search overlay |
| `Switch` | Settings toggles (voice, dark mode, auto-approve) |
| `Progress` | Action execution progress, upload progress |
| `Collapsible` | Expandable log entries, FAQ items, settings sections |

### Theming with CSS Variables

shadcn/ui uses CSS variables for theming, which maps perfectly to Mai's design token system:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 238.7 83.5% 66.7%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 238.7 83.5% 66.7%;
  --radius: 0.5rem;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 238.7 83.5% 66.7%;
  /* ... dark mode overrides ... */
}
```

---

## Common Mistakes

This is a catalog of things that should NEVER be done. If you catch yourself doing any of these, stop and revise.

### Layout and Spacing

- **Inconsistent padding:** A card with 12px padding next to a card with 20px padding. Use design tokens — all cards use the same padding
- **No breathing room:** Elements crammed together with 2–4px gaps. If two elements are related, use 8px. If they are independent, use 16px
- **Misaligned elements:** A form where labels and inputs are not left-aligned. A table where columns are not consistently spaced. Use a grid or consistent flex alignment
- **Overflowing content:** Text that extends beyond its container, images that break the grid, long URLs that break layouts. Use `overflow: hidden`, `text-overflow: ellipsis`, and `word-break: break-word` as needed

### Typography

- **Font size chaos:** Body text at 13px in one place, 14px in another, 15px in another. Define a type scale and use it
- **Decorative fonts for UI:** Script fonts, display fonts, or handwritten fonts for interface elements. Save them for the marketing site
- **All caps body text:** Hard to read and feels like shouting. All caps for labels (small text, letter-spaced) is fine
- **Truncated text without tooltip:** If you truncate a string with ellipsis, provide a tooltip on hover showing the full text

### Color

- **Too many colors:** Using 8+ distinct colors on a single page. Limit to: primary, muted, success, warning, danger, and 1 accent
- **Random accent colors:** A green button here, an orange badge there, a blue link somewhere else — without any semantic system. Every color should have a defined role
- **Low contrast text:** Light gray text on white background. Test all text at 4.5:1 minimum
- **Red for everything alarming:** Error states, destructive actions, and warning indicators should not all be red. Red = danger/destructive. Amber = warning/caution. Use the right color for the right severity

### Interaction

- **No hover states:** Interactive elements that look identical when hovered and not hovered. The user cannot tell what is clickable
- **No focus rings:** Removing `outline` without providing a custom focus indicator. Keyboard users are lost
- **Tiny click targets:** Buttons or links smaller than 44×44px on touch devices
- **Slow animations:** Animations that take 1+ seconds. UI animation should complete in under 500ms
- **Animations that block interaction:** An animation that prevents the user from clicking until it finishes. Animations should enhance, not gate

### Content

- **Vague error messages:** "Something went wrong" or "An error occurred." Tell the user what happened and what to do about it
- **Wall of text:** Paragraphs longer than 4 sentences. Break them up with subheadings, lists, or collapsible sections
- **Lorem ipsum:** Placeholder text in a production UI. Write real content from day one
- **Inconsistent capitalization:** "Save Changes" in one place, "save changes" in another. Title case for buttons and labels, sentence case for descriptions
- **Marketing copy in the product:** "Leverage best-in-class AI" in a settings page. Product UI text should be functional, not promotional

### Forms

- **No validation until submit:** The user fills out 12 fields, submits, and gets 5 errors. Validate on blur
- **Required field markers missing:** The user does not know which fields are optional until they submit without them
- **No helper text:** Ambiguous fields like "Retention" without context. "Retention period (days)" is better
- **Aggressive defaults:** Opting the user into marketing emails by default. Defaults should favor the user's privacy

### Loading

- **Spinning wheel with no context:** A spinner that appears with no text explaining what is loading or how long it might take
- **Nothing while loading:** A blank screen during a 2-second data fetch. Use skeletons or at minimum a loading indicator
- **Content appearing suddenly:** Data that loads and renders instantly without transition. Use a brief fade-in (150ms) to prevent the jarring pop

---

## Pre-Flight Checklist

Before generating or modifying any UI, run through this checklist mentally. It should take less than 30 seconds and catch the most common issues.

### Structure
- [ ] Does this follow the 8px spacing system?
- [ ] Is the visual hierarchy clear — anchor, supporting, ambient?
- [ ] Does the layout work at all breakpoints (mobile, tablet, desktop)?
- [ ] Are related elements grouped and unrelated elements separated?

### Typography
- [ ] Am I using the defined type scale (no arbitrary font sizes)?
- [ ] Are heading levels sequential (no skipping H2 to H4)?
- [ ] Is body text readable (14–16px, 1.5 line height)?
- [ ] Are there any walls of text that need breaking up?

### Color
- [ ] Am I using semantic colors (primary for actions, danger for destructive, etc.)?
- [ ] Does this work in both light and dark mode?
- [ ] Does all text meet WCAG 2.2 AA contrast (4.5:1 for body, 3:1 for large)?
- [ ] Am I using 6 or fewer distinct colors on this page?

### Interaction
- [ ] Do all interactive elements have hover and focus states?
- [ ] Are focus rings visible (using :focus-visible)?
- [ ] Are touch targets at least 44×44px?
- [ ] Do animations respect prefers-reduced-motion?
- [ ] Are animation durations under 500ms?

### Accessibility
- [ ] Is the HTML semantic (button, nav, main, article)?
- [ ] Do all images have alt text?
- [ ] Do all inputs have visible labels?
- [ ] Is the tab order logical?
- [ ] Can all functionality be reached via keyboard?

### Performance
- [ ] Are images optimized (WebP, lazy loaded, sized)?
- [ ] Are large lists virtualized?
- [ ] Are animations using only transform and opacity?
- [ ] Are image dimensions set to prevent layout shifts?

### Content
- [ ] Is error messaging specific and actionable?
- [ ] Is helper text present for ambiguous fields?
- [ ] Are empty states helpful with clear next actions?
- [ ] Is the copy conversational and concise?

---

*This skill is Mai's internal design handbook. Mai should reference these principles when generating, evaluating, or modifying any web UI — including its own HUD, chat interface, and any future UI surfaces. When in doubt: does this serve the user, or does it serve decoration? The answer is always the former.*
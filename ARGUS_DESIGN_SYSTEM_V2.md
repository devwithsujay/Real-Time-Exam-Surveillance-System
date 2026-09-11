# ARGUS Design System v2
### Revising the identity layer while keeping the engineering that already works

## 0. What's changing from v1 and why

The v1 pass (electric cyan `#00D9FF` on deep-space navy `#0a0e27`) scored well on engineering discipline — token structure, motion curves, accessibility floors — but its *identity* is the same category of choice as the cobalt-on-charcoal and teal-on-charcoal directions tried earlier in this project. Softening the cyan's saturation fixes eye strain, not genericness: it's still a blue-family glow accent on near-black, which is the default "tactical HUD" template every surveillance/security dashboard reaches for. If ARGUS is meant to be recognizably ARGUS rather than interchangeable with any other dark-mode security console, the hue family itself has to move, not just its intensity.

This revision keeps everything from v1 that was genuinely good — the pulse-frequency language, the motion-safety guardrails, the touch-target floors, the token-driven structure — and replaces the identity layer with something grounded in what ARGUS actually does: it's an **institutional exam-integrity ledger**, not a spy-satellite console. The accent moves to a muted plum/wine (a color with real associations to seals, academic gowns, and official documents), and the canvas moves off the blue-black "deep space" cliché to a warm, true-neutral dark.

All contrast ratios below were computed against the actual WCAG relative-luminance formula, not asserted.

---

## 1. Color tokens

### Canvas & surfaces — warm neutral, not blue-black
```css
--canvas:          #121011;  /* warm near-black, no blue cast */
--surface:          #1a1719;
--surface-raised:   #221e20;
--surface-sunken:   #0b0a0a;  /* video wells, code blocks */
--border:           rgba(244, 241, 235, 0.07);
--border-strong:    rgba(244, 241, 235, 0.14);
```

### Ink (text)
```css
--ink:        #f0ece4;  /* 16.1 : 1 on canvas */
--ink-muted:  #a89f97;  /*  7.3 : 1 on canvas */
--ink-faint:  #6b6560;  /*  3.3 : 1 — decorative/disabled only, never body text */
```

### Brand accent — muted plum, deliberately outside the severity color wheel
The single most important rule in this system: **the brand accent must never share a hue family with any severity color.** Reds/oranges/yellows/greens are reserved entirely for severity. Blue is reserved for "low/info." That leaves violet/plum as genuinely free territory — and it isn't cyan, blue, or teal, so it breaks the lineage of every prior attempt including ARGUS v1.

```css
--accent:        #8a4a6b;  /* backgrounds, borders, large elements, icons only */
--accent-text:   #b8789a;  /* 5.6 : 1 on canvas, 4.9 : 1 on surface-raised — use for text/links */
--accent-wash:   rgba(138, 74, 107, 0.12);
--accent-border: rgba(138, 74, 107, 0.35);
```
Use `--accent` for fills/icons/large UI (passes 3:1, the AA threshold for non-text and large-text elements). Use `--accent-text` specifically anywhere the color sits under 18px normal-weight text.

### Semantic severity — harmonized to the warm canvas, verified distinct from accent and from each other
Tailwind's stock alert colors (`#EF4444`, `#F59E0B`, `#10B981`) look like a neon circus against a tinted dark canvas because they're calibrated for white backgrounds. These are re-tuned for this canvas specifically:

```css
--critical: #c76454;  /* 4.9 : 1 on canvas */
--high:     #c98a52;  /* 6.5 : 1 on canvas */
--medium:   #c2ab5c;  /* 8.4 : 1 on canvas */
--low:      #6b9ab5;  /* 6.2 : 1 on canvas — the only cool color in the system, reserved for this */
--good:     #6ba883;  /* 6.8 : 1 on canvas */
```
All five clear WCAG AA for normal text on `--canvas`. All five sit at least 25° of hue-wheel distance from `--accent` (plum, ~330°) so a colorblind or quick-glance user never confuses "this is the brand button" with "this is a high-severity flag" — a real risk in v1, since its cyan accent and its `#10B981` success color sit close enough in the cool range to blur together at a glance.

---

## 2. Typography — three families, no redundancy

v1's problem wasn't "three fonts" in the abstract, it was (a) a duplicate monospace family loaded for no reason, and (b) a rounded consumer/fintech sans (Poppins) doing institutional work it isn't suited for. Fix both:

```css
--font-display: 'Source Serif 4', Georgia, serif;  /* section titles, page headers only */
--font-ui:      'Inter', system-ui, sans-serif;      /* everything else — body, labels, controls */
--font-data:    'JetBrains Mono', ui-monospace, monospace; /* timestamps, IDs, confidence %, hashes ONLY */
```

- **One** display face, **one** UI face, **one** mono face — never two monospace families.
- The serif display face is the deliberate identity choice here: it reads as institutional/registrar rather than "tech startup," and it's the one thing in this system that has zero overlap with every cyan-HUD competitor, which will default to a geometric grotesk (Space Grotesk, Poppins, or similar) for headers.
- Load 2 weights per family maximum (e.g. Inter 400/600, Source Serif 4 600/700, JetBrains Mono 400/500) with `font-display: swap` to control FOIT and bundle weight — this was v1's real technical complaint, and it's solved by weight discipline, not by cutting a family that's doing real identity work.
- Mono is for data only. No ALL-CAPS tracked-out mono labels as decoration — if it isn't a timestamp, an ID, a confidence score, or a hash, it's Inter.

---

## 3. Depth & elevation — no blur near video, ever

v1's `backdrop-filter: blur(10px)` glass-panel treatment is a genuine compositing risk on integrated GPUs when it sits near a 30fps `<canvas>`/`<video>` element receiving multiple WebSocket updates per second (ExamMonitor's exact situation) — and it's also a *repeated* cost, not a one-time one, since every alert-row badge glow and card blur repaints on every scroll and every incoming frame.

**Rule: `backdrop-filter` is banned everywhere except floating overlays that never share a viewport region with a `<video>` or `<canvas>` element** — dropdown menus, the command palette, tooltips. Even there, cap it at 6px and prefer solid surfaces first.

```css
--surface-solid: rgba(26, 23, 25, 0.97);   /* use this near video/canvas, not blur */
--elevation-hairline: 1px solid var(--border-strong);
--shadow-modal: 0 16px 40px -8px rgba(0, 0, 0, 0.5); /* modals only — never on list rows or camera cards */
```
Camera feed cards, alert rows, and table rows get a solid surface + hairline border. Modals and dropdowns get the one permitted shadow token. Nothing else gets a shadow or blur — this is also what keeps a 50-row alert table from repainting expensive glow shadows on every scroll frame.

---

## 4. Motion — keep v1's pulse language, it was genuinely good

This is the one part of v1 worth carrying forward almost unchanged:

```css
--pulse-critical: 1.0s;  /* demands attention */
--pulse-warning:  1.5s;  /* noticeable, not alarming */
--pulse-live:     2.5s;  /* calm heartbeat, ambient */

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; }
}
```
Also keep: staggered card entrance capped at 80ms increments up to 6 cards (480ms ceiling), 44×44px minimum touch targets, 2px focus ring with 4px offset. These are format-agnostic good practices independent of the color/font identity — no reason to redo them.

---

## 5. Badges — chip + dot, no glow

```css
.badge {
  display: inline-flex; align-items: center; gap: 0.3rem;
  font-family: var(--font-data); font-size: 0.65rem; font-weight: 600;
  padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid;
  /* no box-shadow, no glow — solid wash background only */
}
.badge-critical { background: rgba(199,100,84,0.12); color: var(--critical); border-color: rgba(199,100,84,0.35); }
.badge-high     { background: rgba(201,138,82,0.12); color: var(--high);     border-color: rgba(201,138,82,0.35); }
.badge-medium   { background: rgba(194,171,92,0.12); color: var(--medium);   border-color: rgba(194,171,92,0.35); }
.badge-low      { background: rgba(107,154,181,0.12); color: var(--low);    border-color: rgba(107,154,181,0.35); }
.badge-good     { background: rgba(107,168,131,0.12); color: var(--good);   border-color: rgba(107,168,131,0.35); }
```
A pulsing dot (`--pulse-live` etc.) is the only motion allowed on a badge. No glow filter, no drop-shadow — those are the expensive-to-repaint, eye-fatiguing effects v1's evaluation flagged, and removing them entirely is cheaper than "calibrating" them.

---

## 6. Radius — two values, enforced everywhere

```css
--r-sm: 4px;  /* buttons, badges, inputs, small controls */
--r-lg: 8px;  /* cards, modals, panels, the sidebar */
```
No third radius value anywhere in the app. No stadium/pill-shaped badges next to rectangular buttons — this inconsistency was visible in the v1 screenshot and it recurs in v1's own badge spec ("pill badge with glow") sitting against its card spec ("standard rounded corners"), which is the same unresolved inconsistency, just inherited.

---

## 7. What this deliberately does NOT do

- No electric/laser accent color of any saturation, cyan or otherwise — the brand color is muted at every scale, full stop. If something needs to visually scream, that's what `--critical` is for, not the brand accent.
- No glassmorphism/blur adjacent to live media.
- No third monospace font, no Poppins-class rounded consumer sans.
- No decorative glow box-shadows on list rows, badges, or cards — reserved exclusively for the one modal shadow token.

## 8. Migration checklist from v1

- [ ] Swap all cyan/teal/cobalt token references to the plum accent + harmonized severity set above.
- [ ] Audit every `backdrop-filter` usage; remove all instances within the ExamMonitor view and any component rendered alongside it.
- [ ] Consolidate to 3 font families, 2 weights each, `font-display: swap`.
- [ ] Reduce all radius usage to the two values above; fix the stadium-pill-badge-next-to-rectangular-button inconsistency.
- [ ] Remove glow `box-shadow` from badges and list rows; keep the one modal shadow token.
- [ ] Re-run contrast checks on any token you adjust — don't reintroduce an unverified color.
- [ ] Update any internal references from "v1 palette" naming to this token set; no code should reference `#00D9FF` or the deep-space-blue canvas values after migration.

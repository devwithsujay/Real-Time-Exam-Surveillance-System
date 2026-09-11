 ARGUS Design System
## The All-Seeing Guardian — Premium Exam Surveillance Dashboard

**Version**: 1.0  
**Last Updated**: September 2026  
**Status**: Production-Ready  
**Audience**: Development Team, Design QA, Product Stakeholders

---

## Table of Contents
1. [Brand Foundation](#brand-foundation)
2. [Color Palette](#color-palette)
3. [Typography System](#typography-system)
4. [Component Specifications](#component-specifications)
5. [Animation & Motion Language](#animation--motion-language)
6. [Spacing & Layout Grid](#spacing--layout-grid)
7. [Elevation & Shadows](#elevation--shadows)
8. [Icons & Iconography](#icons--iconography)
9. [Dark Mode & Accessibility](#dark-mode--accessibility)
10. [Implementation Checklist](#implementation-checklist)

---

## Brand Foundation

### Visual Identity
- **Name**: ARGUS (Greek Mythology — "The All-Seeing One")
- **Tagline**: "See Beyond the Surface"
- **Secondary Tagline**: "The All-Seeing Guardian"
- **Aesthetic**: Sci-fi command center meets enterprise premium
- **Core Values**: Precision, Fairness, Intelligence, Transparency, Assurance
- **Mood**: Confident, authoritative, trustworthy, uncompromising on integrity

### Design Principles
1. **Command Center Authority** — Users trust that ARGUS sees everything and decides fairly
2. **Elegant Precision** — Every element serves a purpose; no bloat, no distraction
3. **Animated Intelligence** — Motion reveals system awareness and active monitoring
4. **Dark, Dramatic** — High contrast with strategic accent colors to guide focus
5. **Accessible Premium** — Beautiful AND functional for diverse users under stress

---

## Color Palette

### Primary Brand Colors

#### Deep Teal/Cyan (Primary Action)
```
Color Name: ARGUS Cyan
Hex: #00D9FF
RGB: (0, 217, 255)
HSL: 186°, 100%, 50%
Usage: Primary buttons, active states, system status indicators, brand accent
Accessibility: Use with dark backgrounds only (contrast ratio 7.5:1 on #0a0e27)
```

#### Deep Charcoal (Primary Background)
```
Color Name: Deep Space
Hex: #0a0e27
RGB: (10, 14, 39)
HSL: 228°, 59%, 10%
Usage: Main background, primary dark surface
```

#### Secondary Dark (Card/Panel Background)
```
Color Name: Night Blue
Hex: #1a1f3a
RGB: (26, 31, 58)
HSL: 228°, 38%, 16%
Usage: Cards, panels, secondary surfaces (slight lift from primary bg)
```

#### Tertiary Dark (Input/Border)
```
Color Name: Slate Void
Hex: #2d3555
RGB: (45, 53, 85)
HSL: 226°, 31%, 25%
Usage: Borders, input fields, dividers, hover states
```

### Alert/Status Colors

#### Critical/High Severity
```
Color Name: Danger Red
Hex: #EF4444
RGB: (239, 68, 68)
HSL: 0°, 91%, 60%
Usage: Critical incidents, high-risk violations, destructive actions
Variants:
  - Dark (use on backgrounds): #991B1B (19% lightness)
  - Light (hover): #FCA5A5 (only for accessibility text labels)
```

#### Warning/Medium Severity
```
Color Name: Amber Alert
Hex: #F59E0B
RGB: (245, 158, 11)
HSL: 38°, 92%, 50%
Usage: Medium-severity anomalies, warnings, pending actions
```

#### Success/Verified
```
Color Name: Emerald Confirm
Hex: #10B981
RGB: (16, 185, 129)
HSL: 160°, 84%, 39%
Usage: Verified candidates, cleared checks, successful actions
```

#### Info/Neutral
```
Color Name: Sky Blue
Hex: #0EA5E9
RGB: (14, 165, 233)
HSL: 200°, 94%, 48%
Usage: Informational messages, secondary actions, neutral states
```

### Semantic Color Mapping

```css
/* Background Hierarchy */
--color-bg-primary: #0a0e27;      /* Main canvas */
--color-bg-secondary: #1a1f3a;    /* Cards, panels */
--color-bg-tertiary: #2d3555;     /* Inputs, hover overlays */

/* Text Hierarchy */
--color-text-primary: #f1f5f9;    /* Primary text (98% white) */
--color-text-secondary: #94a3b8;  /* Secondary text (60% opacity) */
--color-text-disabled: #475569;   /* Disabled/inactive text (40% opacity) */

/* Status & Alerts */
--color-status-critical: #EF4444;
--color-status-warning: #F59E0B;
--color-status-success: #10B981;
--color-status-info: #0EA5E9;

/* Accent & Interaction */
--color-accent-primary: #00D9FF;  /* ARGUS Cyan */
--color-accent-dark: #00a8cc;     /* Darker cyan for hover */
--color-accent-light: #33e6ff;    /* Lighter cyan for states */

/* Borders & Dividers */
--color-border: rgba(45, 53, 85, 0.6);
--color-border-strong: rgba(45, 53, 85, 1);

/* Elevation & Glass */
--color-glass-light: rgba(26, 31, 58, 0.4);
--color-glass-medium: rgba(26, 31, 58, 0.6);
```

### Color Usage Reference Table

| Element | Color | Hex | Notes |
|---------|-------|-----|-------|
| Primary CTA Button | ARGUS Cyan | #00D9FF | 100% opacity, glowing effect |
| Secondary Button | Slate Void | #2d3555 | Border only, no fill |
| Critical Alert | Danger Red | #EF4444| Pulsing animation, icon + text |
| Warning Badge | Amber Alert | #F59E0B | Solid fill, medium contrast |
| Success Checkmark | Emerald Confirm | #10B981 | No animation, simple fill |
| Link Text | ARGUS Cyan | #00D9FF | Underline on hover |
| Disabled Text | Slate Void | #475569 | 50% opacity |
| Card Background | Night Blue | #1a1f3a | Slight border, shadow |
| Modal Backdrop | Deep Space | #0a0e27 | 85% opacity blur |
| Focus Ring | ARGUS Cyan | #00D9FF | 2px, glow only (no solid ring) |

---

## Typography System

### Font Stack

#### Display Font (Headings, Branding)
```
Font Family: "Space Mono" (Fallback: "Courier New", monospace)
Weight Variants: 400 (Regular), 700 (Bold)
Character: Geometric, futuristic, confidence-inspiring
Usage: Logo, h1, section headers, dashboard titles
```
*Rationale*: Space Mono has a sci-fi, technical character that reinforces ARGUS as an advanced surveillance system. Monospace also suggests code/precision.

#### Body Font (UI Copy, Labels)
```
Font Family: "Poppins" (Fallback: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)
Weight Variants: 300 (Light), 400 (Regular), 500 (Medium), 600 (Semibold), 700 (Bold)
Character: Clean, modern, highly legible at small sizes
Usage: Body text, labels, descriptions, UI controls
```
*Rationale*: Poppins is geometric and friendly while maintaining clarity for mission-critical data.

#### Monospace Font (Data, Code, Timestamps)
```
Font Family: "IBM Plex Mono" (Fallback: "Courier New", monospace)
Weight Variants: 400 (Regular), 600 (Bold)
Character: Neutral, technical, precise
Usage: Event IDs, timestamps, UUIDs, hexadecimal values, error messages
```
*Rationale*: IBM Plex Mono is professional and maintains perfect alignment for tabular data.

### Type Scale

```
Baseline: 16px (1rem)

Display 1 (Logo/Hero)
  Size: 48px (3rem)
  Weight: 700 (Bold)
  Line Height: 1.2 (57.6px)
  Letter Spacing: -1px
  Font Family: Space Mono
  Usage: ARGUS logo text, page hero titles

Display 2 (Major Headings)
  Size: 36px (2.25rem)
  Weight: 700 (Bold)
  Line Height: 1.3 (46.8px)
  Letter Spacing: -0.5px
  Font Family: Space Mono
  Usage: Exam hall names, major section titles

Heading 1
  Size: 28px (1.75rem)
  Weight: 700 (Bold)
  Line Height: 1.4 (39.2px)
  Letter Spacing: 0
  Font Family: Poppins
  Usage: Dashboard section headers, modal titles

Heading 2
  Size: 24px (1.5rem)
  Weight: 600 (Semibold)
  Line Height: 1.4 (33.6px)
  Letter Spacing: 0
  Font Family: Poppins
  Usage: Card titles, subsection headers

Heading 3
  Size: 20px (1.25rem)
  Weight: 600 (Semibold)
  Line Height: 1.5 (30px)
  Letter Spacing: 0
  Font Family: Poppins
  Usage: Small card titles, labels

Body Large
  Size: 18px (1.125rem)
  Weight: 400 (Regular)
  Line Height: 1.6 (28.8px)
  Letter Spacing: 0
  Font Family: Poppins
  Usage: Primary body text, descriptions

Body Regular
  Size: 16px (1rem)
  Weight: 400 (Regular)
  Line Height: 1.6 (25.6px)
  Letter Spacing: 0
  Font Family: Poppins
  Usage: Default body text, UI copy

Body Small
  Size: 14px (0.875rem)
  Weight: 400 (Regular)
  Line Height: 1.5 (21px)
  Letter Spacing: 0
  Font Family: Poppins
  Usage: Secondary labels, helper text, captions

Label Medium
  Size: 12px (0.75rem)
  Weight: 600 (Semibold)
  Line Height: 1.4 (16.8px)
  Letter Spacing: 0.5px
  Font Family: Poppins
  Usage: Button labels, badge text, field labels

Label Small
  Size: 11px (0.6875rem)
  Weight: 600 (Semibold)
  Line Height: 1.4 (15.4px)
  Letter Spacing: 0.5px
  Font Family: Poppins
  Usage: Icon labels, tiny badges, timestamps

Monospace (Data)
  Size: 13px (0.8125rem)
  Weight: 400 (Regular)
  Line Height: 1.6 (20.8px)
  Letter Spacing: 0.5px
  Font Family: IBM Plex Mono
  Usage: Event IDs, UUIDs, timestamps, error messages
```

### Typography CSS Variables

```css
/* Headings */
--type-display-1: 3rem / 1.2 "Space Mono";
--type-display-2: 2.25rem / 1.3 "Space Mono";
--type-h1: 1.75rem / 1.4 "Poppins";
--type-h2: 1.5rem / 1.4 "Poppins";
--type-h3: 1.25rem / 1.5 "Poppins";

/* Body */
--type-body-lg: 1.125rem / 1.6 "Poppins";
--type-body-md: 1rem / 1.6 "Poppins";
--type-body-sm: 0.875rem / 1.5 "Poppins";

/* Labels */
--type-label-md: 0.75rem / 1.4 "Poppins";
--type-label-sm: 0.6875rem / 1.4 "Poppins";

/* Monospace */
--type-mono: 0.8125rem / 1.6 "IBM Plex Mono";
```

---

## Component Specifications

### Button Component

#### Primary Button
```
State: Default
  Background: #00D9FF (ARGUS Cyan)
  Text Color: #0a0e27 (Deep Space, high contrast)
  Text Weight: 600 (Semibold)
  Padding: 12px 24px (0.75rem 1.5rem)
  Border Radius: 8px
  Font Size: 14px (Label Medium)
  Box Shadow: 0 0 20px rgba(0, 217, 255, 0.3) (glow effect, no offset)
  Transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1)

State: Hover
  Background: #33e6ff (lighter cyan)
  Box Shadow: 0 0 30px rgba(0, 217, 255, 0.6) (increased glow)
  Transform: translateY(-2px)

State: Active/Pressed
  Background: #00a8cc (darker cyan)
  Transform: translateY(0px)
  Box Shadow: 0 0 15px rgba(0, 217, 255, 0.4)

State: Disabled
  Background: #475569 (text-disabled)
  Text Color: #64748b (muted)
  Cursor: not-allowed
  Box Shadow: none
  Opacity: 0.5
```

#### Secondary Button
```
State: Default
  Background: transparent
  Border: 2px solid #2d3555 (Slate Void)
  Text Color: #f1f5f9 (primary text)
  Text Weight: 600
  Padding: 10px 22px
  Border Radius: 8px
  Font Size: 14px
  Transition: all 200ms ease-out

State: Hover
  Background: rgba(45, 53, 85, 0.3)
  Border Color: #00D9FF (ARGUS Cyan)
  Text Color: #00D9FF
  Box Shadow: 0 0 15px rgba(0, 217, 255, 0.2)

State: Active
  Background: rgba(0, 217, 255, 0.1)
  Border Color: #00a8cc
  Box Shadow: inset 0 0 10px rgba(0, 217, 255, 0.15)
```

#### Icon Button (Compact)
```
State: Default
  Size: 40px × 40px
  Background: transparent
  Icon Color: #94a3b8 (secondary text)
  Border Radius: 6px
  Transition: all 150ms ease-out

State: Hover
  Background: rgba(0, 217, 255, 0.1)
  Icon Color: #00D9FF
  Box Shadow: 0 0 12px rgba(0, 217, 255, 0.15)

State: Active
  Background: rgba(0, 217, 255, 0.2)
  Icon Color: #00D9FF
```

### Card Component

```
Structure:
  Container: 360px width (responsive, min 280px mobile)
  Background: #1a1f3a (Night Blue)
  Border: 1px solid rgba(45, 53, 85, 0.6)
  Border Radius: 12px
  Padding: 24px
  Box Shadow:
    - 0 10px 30px rgba(0, 0, 0, 0.3) (depth shadow)
    - inset 0 1px 0 rgba(0, 217, 255, 0.1) (subtle top highlight)
  Transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1)

State: Hover (Elevated Card)
  Background: #2d3555 (Slate Void, subtle lift)
  Border Color: rgba(0, 217, 255, 0.3)
  Box Shadow:
    - 0 20px 45px rgba(0, 0, 0, 0.4)
    - inset 0 1px 0 rgba(0, 217, 255, 0.15)
  Transform: translateY(-4px)

State: Active/Selected
  Border Color: #00D9FF
  Box Shadow:
    - 0 15px 40px rgba(0, 217, 255, 0.2)
    - inset 0 1px 0 rgba(0, 217, 255, 0.3)

Internal Elements:
  Card Header: Heading 3, 20px margin-bottom
  Card Body: Body Regular, line-height 1.6
  Card Footer: padding-top 16px, border-top 1px solid rgba(45, 53, 85, 0.4)
  Card Divider: 1px solid rgba(45, 53, 85, 0.4), margin: 16px 0
```

### Input Field Component

```
Container:
  Width: 100% (responsive)
  Height: 44px
  Padding: 12px 16px
  Background: #2d3555 (Slate Void, input bg)
  Border: 2px solid #2d3555
  Border Radius: 8px
  Font: Poppins 14px, regular
  Color: #f1f5f9 (primary text)
  Transition: all 200ms ease-out
  Outline: none

State: Focus
  Border Color: #00D9FF
  Background: rgba(45, 53, 85, 0.8)
  Box Shadow: 0 0 12px rgba(0, 217, 255, 0.3)
  Caret Color: #00D9FF

State: Filled (Has Value)
  Border Color: rgba(0, 217, 255, 0.4)

State: Error
  Border Color: #EF4444 (Danger Red)
  Box Shadow: 0 0 12px rgba(239, 68, 68, 0.2)

State: Disabled
  Background: rgba(45, 53, 85, 0.3)
  Border Color: rgba(45, 53, 85, 0.3)
  Color: #475569
  Cursor: not-allowed

Placeholder:
  Color: #64748b (60% opacity secondary)
  Font Style: normal
  Font Weight: 400

Label (Above Input):
  Position: absolute, top -24px
  Font: Poppins 12px, semibold
  Color: #f1f5f9
  Letter Spacing: 0.5px
  Text Transform: uppercase
```

### Badge Component

```
Critical Badge:
  Background: rgba(239, 68, 68, 0.15)
  Border: 1px solid rgba(239, 68, 68, 0.5)
  Text Color: #FECACA (light red)
  Padding: 4px 12px
  Border Radius: 20px (full pill)
  Font: Label Small (11px, 600)
  Animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite

Warning Badge:
  Background: rgba(245, 158, 11, 0.15)
  Border: 1px solid rgba(245, 158, 11, 0.5)
  Text Color: #FDE047
  Padding: 4px 12px
  Border Radius: 20px
  Font: Label Small
  Animation: none (static)

Success Badge:
  Background: rgba(16, 185, 129, 0.15)
  Border: 1px solid rgba(16, 185, 129, 0.5)
  Text Color: #86EFAC
  Padding: 4px 12px
  Border Radius: 20px
  Font: Label Small
  Animation: none

Info Badge:
  Background: rgba(14, 165, 233, 0.15)
  Border: 1px solid rgba(14, 165, 233, 0.5)
  Text Color: #7DD3FC
  Padding: 4px 12px
  Border Radius: 20px
  Font: Label Small
```

### Modal/Dialog Component

```
Overlay (Backdrop):
  Position: fixed, full viewport
  Background: rgba(10, 14, 39, 0.85)
  Backdrop Filter: blur(4px)
  Animation: fadeIn 300ms ease-out

Modal Container:
  Position: fixed, center (50% top + left, -50% transform)
  Width: 90% max (responsive)
  Max Width: 600px
  Background: #1a1f3a (Night Blue)
  Border: 1px solid rgba(0, 217, 255, 0.2)
  Border Radius: 16px
  Box Shadow: 0 25px 50px rgba(0, 0, 0, 0.5)
  Padding: 32px
  Animation: slideUp 350ms cubic-bezier(0.16, 1, 0.3, 1)
  Z-Index: 1000

Modal Header:
  Margin-Bottom: 24px
  Font: Heading 1 (28px, 700)
  Color: #f1f5f9

Modal Body:
  Font: Body Regular
  Color: #94a3b8
  Line Height: 1.6
  Margin-Bottom: 24px

Modal Footer:
  Display: flex, gap 12px
  Justify-Content: flex-end
  Padding-Top: 24px
  Border-Top: 1px solid rgba(45, 53, 85, 0.4)

Close Button:
  Position: absolute top-right
  Size: 40px × 40px
  Icon: X, 20px
  Color: #94a3b8
  Hover: color #00D9FF, background rgba(0, 217, 255, 0.1)
```

### Status Indicator (Live Pulse)

```
Default (Offline/Unknown):
  Size: 12px × 12px
  Background: #475569 (text-disabled)
  Border Radius: 50% (full circle)
  Animation: none

Active/Online:
  Size: 12px × 12px
  Background: #10B981 (Emerald)
  Border Radius: 50%
  Animation: pulse 2s infinite
    - 0%: box-shadow 0 0 0 0 rgba(16, 185, 129, 0.7)
    - 70%: box-shadow 0 0 0 10px rgba(16, 185, 129, 0)

Warning/At-Risk:
  Size: 12px × 12px
  Background: #F59E0B (Amber)
  Border Radius: 50%
  Animation: pulse 1.5s infinite (faster)

Critical/Alert:
  Size: 12px × 12px
  Background: #EF4444 (Red)
  Border Radius: 50%
  Animation: pulse 1s infinite (fastest, more dramatic)
    - 0%, 100%: box-shadow 0 0 0 0 rgba(239, 68, 68, 0.7)
    - 50%: box-shadow 0 0 0 12px rgba(239, 68, 68, 0)
```

### Table Component

```
Container:
  Border Collapse: collapse
  Width: 100%
  Border Spacing: 0
  Font: Body Small (14px)

Table Header (thead):
  Background: rgba(45, 53, 85, 0.5)
  Border-Bottom: 2px solid rgba(0, 217, 255, 0.2)
  Sticky: position sticky, top 0

Header Cell (th):
  Padding: 16px
  Font: Label Medium (12px, 600)
  Color: #94a3b8 (secondary text, uppercase)
  Text-Align: left
  Letter-Spacing: 0.5px
  Text-Transform: uppercase

Table Body (tbody):
  Row: border-bottom 1px solid rgba(45, 53, 85, 0.4)
  Row Hover: background rgba(0, 217, 255, 0.05)

Body Cell (td):
  Padding: 14px 16px
  Color: #f1f5f9
  Vertical-Align: middle

Alternating Rows (Optional):
  Even Row Background: transparent
  Odd Row Background: rgba(45, 53, 85, 0.3)
  Transition: background 200ms ease-out

Zebra Stripe Disabled (Dark theme better without)
```

### Alert/Toast Notification

```
Alert Container:
  Position: fixed, top-right (24px offset)
  Width: 380px (responsive, 90% mobile)
  Padding: 16px
  Background: #1a1f3a (Night Blue)
  Border: 1px solid (color-dependent)
  Border-Radius: 12px
  Box-Shadow: 0 10px 30px rgba(0, 0, 0, 0.4)
  Z-Index: 2000
  Animation: slideIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)

Critical Alert:
  Border-Left: 4px solid #EF4444 (Danger Red)
  Icon: ExclamationTriangle, #EF4444
  Title Color: #FECACA

Success Alert:
  Border-Left: 4px solid #10B981 (Emerald)
  Icon: CheckCircle, #10B981
  Title Color: #86EFAC

Warning Alert:
  Border-Left: 4px solid #F59E0B (Amber)
  Icon: AlertCircle, #F59E0B
  Title Color: #FDE047

Info Alert:
  Border-Left: 4px solid #0EA5E9 (Sky Blue)
  Icon: InfoCircle, #0EA5E9
  Title Color: #7DD3FC

Close Button:
  Position: absolute top-right
  Size: 24px
  Color: #94a3b8
  Cursor: pointer
  Hover: color #00D9FF

Auto-Dismiss:
  Duration: 5 seconds (configurable)
  Animation: slideOut 300ms ease-in-out (before removal)
```

### Dropdown/Select Component

```
Trigger Button:
  Height: 44px
  Padding: 12px 16px
  Background: #2d3555 (Slate Void)
  Border: 2px solid #2d3555
  Border-Radius: 8px
  Font: Body Regular (14px)
  Color: #f1f5f9
  Display: flex, justify-content: space-between, align-items: center
  Chevron Icon: 16px, color #94a3b8
  Transition: all 200ms ease-out

Trigger State: Hover
  Border-Color: rgba(0, 217, 255, 0.4)
  Background: rgba(45, 53, 85, 0.8)

Trigger State: Open
  Border-Color: #00D9FF
  Background: rgba(45, 53, 85, 0.9)
  Chevron: transform rotate(180deg)
  Box-Shadow: 0 0 12px rgba(0, 217, 255, 0.2)

Dropdown Menu:
  Position: absolute, below trigger
  Width: 100% (match trigger width)
  Background: #1a1f3a (Night Blue)
  Border: 1px solid rgba(0, 217, 255, 0.2)
  Border-Radius: 8px
  Box-Shadow: 0 10px 30px rgba(0, 0, 0, 0.4)
  Max-Height: 320px (scroll if overflow)
  Animation: slideDown 200ms cubic-bezier(0.16, 1, 0.3, 1)
  Overflow-Y: auto
  Z-Index: 100

Menu Item:
  Padding: 12px 16px
  Font: Body Regular (14px)
  Color: #f1f5f9
  Display: flex, align-items: center
  Gap: 12px
  Cursor: pointer
  Transition: all 150ms ease-out
  Border-Left: 2px solid transparent

Item Hover:
  Background: rgba(0, 217, 255, 0.1)
  Border-Left-Color: #00D9FF
  Color: #00D9FF

Item Selected:
  Background: rgba(0, 217, 255, 0.2)
  Border-Left-Color: #00D9FF
  Font-Weight: 600
  Checkmark Icon: 16px, color #00D9FF

Item Disabled:
  Color: #475569
  Cursor: not-allowed
  Opacity: 0.5
```

---

## Animation & Motion Language

### Core Animation Principles

1. **Speed**: Prioritize 200-400ms for most interactions. Longer for complex sequences (500-800ms).
2. **Easing**: Use cubic-bezier for intentional motion. Avoid linear.
3. **Purpose**: Every animation should reveal, guide attention, or confirm state change.
4. **Restraint**: Animate once per interaction. Don't stack multiple animations simultaneously (except staggered entrance).

### Easing Functions

```css
/* Custom Easing Library */

/* Entrance/Fast (User initiates interaction) */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);

/* Emphasis (Draw attention) */
--ease-elastic: cubic-bezier(0.34, 1.56, 0.64, 1);

/* Exit/Slow */
--ease-in: cubic-bezier(0.4, 0, 1, 1);

/* Instant Feedback */
--ease-instant: cubic-bezier(0.4, 0, 0.6, 1);
```

### Core Animations

#### Fade In
```
Duration: 300ms
Easing: cubic-bezier(0.4, 0, 0.2, 1)
Keyframes:
  0%: opacity 0
  100%: opacity 1
Usage: Page load, component entrance, content reveal
```

#### Slide Up
```
Duration: 350ms
Easing: cubic-bezier(0.16, 1, 0.3, 1)
Keyframes:
  0%: 
    opacity: 0
    transform: translateY(20px)
  100%:
    opacity: 1
    transform: translateY(0)
Usage: Modal entrance, card pop-in, content emergence
```

#### Slide In (Left)
```
Duration: 300ms
Easing: cubic-bezier(0.16, 1, 0.3, 1)
Keyframes:
  0%:
    opacity: 0
    transform: translateX(-30px)
  100%:
    opacity: 1
    transform: translateX(0)
Usage: Sidebar, panel reveal, content entrance from edge
```

#### Slide Out (Right)
```
Duration: 250ms
Easing: cubic-bezier(0.4, 0, 1, 1)
Keyframes:
  0%:
    opacity: 1
    transform: translateX(0)
  100%:
    opacity: 0
    transform: translateX(30px)
Usage: Dismissal animations, exit from view
```

#### Scale + Fade
```
Duration: 300ms
Easing: cubic-bezier(0.4, 0, 0.2, 1)
Keyframes:
  0%:
    opacity: 0
    transform: scale(0.95)
  100%:
    opacity: 1
    transform: scale(1)
Usage: Button clicks, menu dropdowns, alert entrance
```

#### Pulse (Breathing/Status)
```
Duration: 2s (base)
Easing: cubic-bezier(0.4, 0, 0.6, 1)
Keyframes:
  0%:
    box-shadow: 0 0 0 0 rgba(var(--color-rgb), 0.7)
  70%:
    box-shadow: 0 0 0 10px rgba(var(--color-rgb), 0)
  100%:
    box-shadow: 0 0 0 0 rgba(var(--color-rgb), 0)
Usage: Active status indicators, live monitoring badges
Variants:
  - Slow pulse: 2.5s (normal operation)
  - Medium pulse: 1.5s (warning state)
  - Fast pulse: 1s (critical alerts)
```

#### Glow Effect
```
Duration: Infinite
Easing: cubic-bezier(0.4, 0, 0.6, 1)
Keyframes:
  0%, 100%:
    filter: drop-shadow(0 0 4px rgba(0, 217, 255, 0.5))
  50%:
    filter: drop-shadow(0 0 12px rgba(0, 217, 255, 0.8))
Usage: Focus states, primary buttons, brand accents
```

#### Bounce (Attention)
```
Duration: 600ms
Easing: cubic-bezier(0.34, 1.56, 0.64, 1)
Keyframes:
  0%:
    transform: translateY(0)
  25%:
    transform: translateY(-10px)
  50%:
    transform: translateY(0)
  75%:
    transform: translateY(-5px)
  100%:
    transform: translateY(0)
Usage: New alert badges, urgent action prompts
```

#### Shimmer (Loading)
```
Duration: 2s
Easing: linear
Keyframes:
  0%:
    background-position: -1000px 0
  100%:
    background-position: 1000px 0
Background:
  linear-gradient(90deg,
    rgba(45, 53, 85, 0.3) 0%,
    rgba(45, 53, 85, 0.6) 50%,
    rgba(45, 53, 85, 0.3) 100%)
  background-size: 1000px 100%
Usage: Loading skeletons, lazy image placeholders
```

#### Rotate (Loading Spinner)
```
Duration: 1.2s
Easing: linear
Keyframes:
  0%:
    transform: rotate(0deg)
  100%:
    transform: rotate(360deg)
Usage: Loading indicators, processing states
```

### Micro-Interaction Timings

#### Button Click Response
```
Trigger: Click
Sequence:
  0ms: Scale to 0.98 (press feedback, instant)
  100ms: Return to scale 1.0 (release, 100ms ease-out)
Total Duration: 100ms
Easing: cubic-bezier(0.4, 0, 0.2, 1)
```

#### Form Input Focus
```
Trigger: Focus event
Sequence:
  0ms: Border color change to #00D9FF, glow appear (instant)
  0-200ms: Subtle scale lift (1 to 1.02), opacity increase (instant)
Total Duration: 200ms
Easing: cubic-bezier(0.4, 0, 0.2, 1)
```

#### Hover State Transition
```
Trigger: Mouse enter
Duration: 200ms
Easing: cubic-bezier(0.4, 0, 0.2, 1)
Properties:
  - Background color
  - Border color
  - Box shadow
  - Text color
Simultaneous: All properties animate together (not staggered)
```

#### Modal Appearance
```
Trigger: Open dialog
Sequence:
  1. Backdrop fades in: 200ms ease-out (starts at 0ms)
  2. Modal slides up: 350ms ease-out (starts at 50ms delay, stagger effect)
Total Duration: 400ms perceived
Easing: cubic-bezier(0.16, 1, 0.3, 1) for modal
```

#### Alert Toast Entrance
```
Trigger: New notification
Sequence:
  0ms: Slide in from right (0-300ms, ease-out)
  5s: Auto-dismiss begins
  5s-5.3s: Slide out right (250ms, ease-in)
Stagger: Each new alert adds 80ms delay (stack effect)
```

#### Card Stagger Entrance
```
Trigger: Page/list load
Sequence:
  Card 1: Fade + slide up at 0ms
  Card 2: Fade + slide up at 80ms
  Card 3: Fade + slide up at 160ms
  Card N: Fade + slide up at (N × 80ms)
Maximum Stagger: 6 cards (480ms total sequence)
Individual Duration: 350ms each
Easing: cubic-bezier(0.16, 1, 0.3, 1)
```

#### Data Refresh Animation
```
Trigger: New data arrives
Sequence:
  1. Current element fades out: 150ms
  2. Shimmer loading state: 2s
  3. New content fades in: 250ms
Total Duration: ~2.4s
Purpose: Confirm update to user without jarring replacement
```

### Page Transition Animations

#### Page Enter
```
Timing: 300ms
Easing: cubic-bezier(0.4, 0, 0.2, 1)
Sequence:
  1. Backdrop fades in: 0-150ms
  2. Content fades in: 100-300ms (overlap with backdrop)
  3. Content subtle scale: 0.98 → 1.0 over 300ms
```

#### Page Exit
```
Timing: 250ms
Easing: cubic-bezier(0.4, 0, 1, 1)
Sequence:
  1. Content fades out: 0-250ms
  2. Content scale: 1.0 → 0.98 over 250ms
```

---

## Spacing & Layout Grid

### Spacing Scale

```
Base Unit: 8px (0.5rem)

--space-xs: 4px (0.25rem)     — Minimal, icon gaps
--space-sm: 8px (0.5rem)      — Tight, adjacent elements
--space-md: 16px (1rem)       — Standard, components
--space-lg: 24px (1.5rem)     — Comfortable, sections
--space-xl: 32px (2rem)       — Large, major separation
--space-2xl: 48px (3rem)      — Breathing room, page sections
--space-3xl: 64px (4rem)      — Major vertical rhythm

Guideline:
  Use multiples of 8px for all dimensions
  Padding inside components: md-lg (16-24px)
  Margin between components: md-xl (16-32px)
  Section gaps: xl-2xl (32-48px)
```

### Layout Grid

```
Desktop Viewport (1440px+):
  Container Max Width: 1320px
  Columns: 12 (each column 110px, gutters 20px)
  Margin: 40px auto (centered)
  Padding: 40px sides

Tablet Viewport (768px-1439px):
  Container Max Width: 100% minus 40px margins
  Columns: 8
  Margin: 0 20px
  Padding: 20px sides

Mobile Viewport (<768px):
  Container Max Width: 100%
  Columns: 4
  Margin: 0
  Padding: 16px sides
  Stack all components vertically

Breakpoints (CSS variables):
  --breakpoint-sm: 640px (small screens)
  --breakpoint-md: 768px (tablets)
  --breakpoint-lg: 1024px (laptops)
  --breakpoint-xl: 1280px (desktops)
  --breakpoint-2xl: 1536px (large displays)
```

### Component Sizing

```
Minimum Touch Target: 44px × 44px (buttons, clickable areas)
Icon Base Size: 24px (primary), 16px (secondary), 20px (standard)
Card Min Width: 280px (mobile), 360px (desktop)
Modal Max Width: 600px
Sidebar Width: 280px (fixed), 100% (mobile)
Dialog/Overlay Z-Index: 1000+
Dropdown Menu Z-Index: 100
Notifications Z-Index: 2000+
```

---

## Elevation & Shadows

### Shadow System

```
Elevation 0 (Flat):
  box-shadow: none

Elevation 1 (Subtle Lift):
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2)
  Usage: Subtle cards, hover states on flat elements

Elevation 2 (Cards Default):
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(0, 217, 255, 0.1)
  Usage: Standard cards, panels

Elevation 3 (Cards Hover/Active):
  box-shadow:
    0 20px 45px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(0, 217, 255, 0.15)
  Usage: Elevated cards on interaction

Elevation 4 (Modals):
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5)
  Usage: Dialogs, large overlays

Elevation 5 (Dropdowns/Popovers):
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4)
  Usage: Dropdown menus, tooltips

Elevation 6 (Toast/Notifications):
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(0, 217, 255, 0.1)
  Usage: Alert notifications, toasts

Glow Effect (Special):
  box-shadow:
    0 0 20px rgba(0, 217, 255, 0.3),
    0 0 40px rgba(0, 217, 255, 0.15)
  Usage: Focus states, primary actions, brand moments
  Variants: Change color based on status (red for critical, amber for warning, etc.)
```

### Blur & Backdrop

```
Backdrop Blur (Modal Overlay):
  backdrop-filter: blur(4px)
  Alternative: filter: blur(4px) on pseudo-element background

Glass Morphism (Cards):
  background: rgba(26, 31, 58, 0.4)
  backdrop-filter: blur(10px)
  border: 1px solid rgba(0, 217, 255, 0.1)
  Note: Use sparingly; primarily in hero sections or overlays

Depth Layers:
  Layer 0: Background (#0a0e27)
  Layer 1: Subtle blur, minimal (unused in main interface)
  Layer 2: Card blur (rgba(..., 0.4) with 10px blur)
  Layer 3: Overlay blur (4px, full opacity color)
```

---

## Icons & Iconography

### Icon Library

**Recommended**: Heroicons v2 or Feather Icons (minimal, clean, sci-fi compatible)

### Icon Sizing & Usage

```
Size: 16px (labels, dense UI, small secondary)
  Usage: Badge icons, small buttons, table icons
  Stroke Width: 2px
  Padding Around: 2px

Size: 20px (standard UI)
  Usage: Button labels, navigation, form fields
  Stroke Width: 2px
  Padding Around: 2px

Size: 24px (primary actions)
  Usage: Large buttons, hero sections, sidebar
  Stroke Width: 1.5px
  Padding Around: 4px

Size: 32px (major accent)
  Usage: Page headings, modal icons, hero graphic
  Stroke Width: 1.5px
  Padding Around: 4px

Size: 48px+ (brand/hero)
  Usage: Logo, featured graphics, loading states
  Stroke Width: 1px
  Padding Around: 8px
```

### Icon Color Palette

```
Primary Icon (Active/Focused):
  Color: #00D9FF (ARGUS Cyan)
  Usage: Active nav items, primary actions, accent

Secondary Icon (Inactive/Disabled):
  Color: #94a3b8 (secondary text)
  Usage: Inactive buttons, secondary labels

Critical Icon:
  Color: #EF4444 (Danger Red)
  Usage: Error states, critical alerts, warnings

Success Icon:
  Color: #10B981 (Emerald Confirm)
  Usage: Success checkmarks, verified states

Warning Icon:
  Color: #F59E0B (Amber Alert)
  Usage: Warning states, pending actions

Info Icon:
  Color: #0EA5E9 (Sky Blue)
  Usage: Information markers, help icons

Disabled Icon:
  Color: #475569 (text-disabled)
  Opacity: 0.5
  Usage: Disabled actions, inactive states
```

### Icon Conventions

```
Navigation Icons:
  Home, Dashboard, Settings, Users, Reports
  Consistent visual weight and alignment

Action Icons:
  Add (+), Delete (trash), Edit (pencil), Export, Share
  Clear semantic meaning

Status Icons:
  CheckCircle (success), XCircle (error), AlertTriangle (warning), Info (info)
  Instant recognition

Data Visualization Icons:
  TrendingUp, TrendingDown, Eye, EyeOff, Filter
  Consistent style with UI

System Icons:
  Download, Upload, Refresh, Loading, Clock, Bell
  Unified stroke and proportions

Direction Icons:
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ArrowRight
  Consistent padding and sizing
```

---

## Dark Mode & Accessibility

### Accessibility Requirements

```
WCAG 2.1 AA Compliance (Minimum):

Color Contrast Ratios:
  Regular Text: 4.5:1 (body on background)
  Large Text (18px+): 3:1
  UI Components (focus, borders): 3:1
  Non-text Content (icons, buttons): 3:1

Focus Indicators:
  Visible, minimum 2px
  Not removed/obscured on :focus state
  Color: #00D9FF (ARGUS Cyan) with 2px glow
  Outline: glowing ring, not solid border (box-shadow: 0 0 0 2px #00D9FF)

Keyboard Navigation:
  Tab order logical and sequential
  Focus traps in modals (trap focus within modal)
  Escape closes modals/dropdowns
  Arrow keys navigate lists/menus

Motion Sensitivity:
  Respect prefers-reduced-motion media query
  Disable all animations if user preference set
```

### Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  
  /* Keep essential transitions (instant feedback) but remove decorative */
  button:focus {
    outline: 2px solid #00D9FF;
  }
}
```

### Dark Mode Notes

```
Primary Concern: Avoid eye strain in dark environments
- All backgrounds use deep, desaturated colors (#0a0e27, #1a1f3a)
- Text uses high-luminance colors (#f1f5f9 for primary)
- Accents (cyan) at 100% saturation to cut through dark space
- Never pure white text (#fff) — always off-white

Testing:
  Test in low-light environment
  Ensure 20% reduction in perceived brightness from Cyan
  Verify no color bleeding/haloing around edges
```

### Screen Reader Optimizations

```
Semantic HTML:
  <button> for buttons (not <div onclick>)
  <label> for form inputs
  <nav>, <main>, <article> for landmarks
  <h1>-<h6> in logical order

ARIA Labels:
  aria-label for icon buttons
  aria-labelledby for complex elements
  aria-describedby for additional context
  aria-live="polite" for notifications
  aria-current="page" for active nav item

Images & Icons:
  Icons in buttons need aria-label
  Decorative icons: aria-hidden="true"
  Images: meaningful alt text
```

---

## Implementation Checklist

### Phase 1: Foundation (Week 1)
- [ ] Import fonts (Space Mono, Poppins, IBM Plex Mono)
- [ ] Set up CSS variables for colors, spacing, typography
- [ ] Create base component library (Button, Card, Input, Badge)
- [ ] Test color contrast in light/dark modes
- [ ] Build authentication screen (login form)

### Phase 2: Core Dashboard (Week 2)
- [ ] Implement navigation/sidebar
- [ ] Build main dashboard layout with grid
- [ ] Create live monitoring panels (camera feeds, status)
- [ ] Add modal/dialog system
- [ ] Implement alerts/toast notifications

### Phase 3: Data Visualization (Week 3)
- [ ] Integrate animation library (Framer Motion for React)
- [ ] Build animated charts (anomaly distribution, timeline)
- [ ] Implement status pulse indicators
- [ ] Create table component with hover states
- [ ] Add loading states (shimmer, spinners)

### Phase 4: Interactions & Polish (Week 4)
- [ ] Page transition animations
- [ ] Microinteractions (button clicks, form focus)
- [ ] Stagger animations on list renders
- [ ] Implement dropdown/select menus
- [ ] Add focus ring glow effects
- [ ] Responsive design testing

### Phase 5: Accessibility & Performance (Week 5)
- [ ] Audit color contrast (WAVE, Lighthouse)
- [ ] Test keyboard navigation (Tab, Enter, Escape)
- [ ] Implement reduced-motion preferences
- [ ] Optimize animation performance (GPU acceleration)
- [ ] Test with screen readers
- [ ] Mobile responsiveness testing

### Phase 6: Refinement & Testing (Week 6)
- [ ] Visual QA across browsers (Chrome, Safari, Firefox, Edge)
- [ ] Performance optimization (animation frame rates, bundle size)
- [ ] Dark mode testing
- [ ] Cross-device testing (mobile, tablet, desktop)
- [ ] Final polish and tweaks

### Quality Assurance Checklist
- [ ] All buttons have 44px minimum height
- [ ] All text meets WCAG AA contrast ratios
- [ ] All animations respect prefers-reduced-motion
- [ ] Focus states visible on all interactive elements
- [ ] Modals trap focus and close on Escape
- [ ] Form errors display with red border + text + icon
- [ ] Loading states prevent user interaction (disabled buttons)
- [ ] Notifications auto-dismiss after 5 seconds
- [ ] No animation lasts longer than 800ms (except loading loops)
- [ ] Glow effects don't cause color bleeding on curved edges

### Performance Targets
- [ ] First Contentful Paint (FCP): <1.5s
- [ ] Largest Contentful Paint (LCP): <2.5s
- [ ] Animation Frame Rate: 60fps (no jank)
- [ ] Bundle Size (CSS + Fonts): <200KB gzipped
- [ ] No layout shifts during animations (CLS < 0.1)

---

## Component API Examples

### Button Component Props (React/Vue)

```jsx
<Button
  variant="primary" | "secondary" | "icon"
  size="small" | "medium" | "large"
  state="default" | "hover" | "active" | "disabled"
  onClick={() => {}}
  icon={<Icon />}
  loading={false}
  aria-label="string"
>
  Button Label
</Button>
```

### Card Component Props

```jsx
<Card
  title="Card Title"
  elevated={false}
  interactive={false}
  onClick={() => {}}
  footer={<Actions />}
  className="optional-class"
>
  Card content
</Card>
```

### Modal Component Props

```jsx
<Modal
  open={true}
  onClose={() => {}}
  title="Modal Title"
  size="medium" | "large"
  closeable={true}
  footer={<Actions />}
>
  Modal content
</Modal>
```

### Alert/Toast Props

```jsx
<Alert
  type="critical" | "warning" | "success" | "info"
  title="Alert Title"
  message="Alert message text"
  action={<Button />}
  onClose={() => {}}
  autoDismiss={5000}
/>
```

---

## Color Hex Reference (Quick Lookup)

| Color Name | Hex | RGB | HSL | Usage |
|------------|-----|-----|-----|-------|
| ARGUS Cyan | #00D9FF | 0, 217, 255 | 186°, 100%, 50% | Primary action, brand |
| Deep Space | #0a0e27 | 10, 14, 39 | 228°, 59%, 10% | Main background |
| Night Blue | #1a1f3a | 26, 31, 58 | 228°, 38%, 16% | Cards, panels |
| Slate Void | #2d3555 | 45, 53, 85 | 226°, 31%, 25% | Borders, inputs |
| Danger Red | #EF4444 | 239, 68, 68 | 0°, 91%, 60% | Critical alerts |
| Amber Alert | #F59E0B | 245, 158, 11 | 38°, 92%, 50% | Warnings |
| Emerald Confirm | #10B981 | 16, 185, 129 | 160°, 84%, 39% | Success states |
| Sky Blue | #0EA5E9 | 14, 165, 233 | 200°, 94%, 48% | Info states |
| Primary Text | #f1f5f9 | 241, 245, 249 | 212°, 33%, 96% | Main text |
| Secondary Text | #94a3b8 | 148, 163, 184 | 215°, 14%, 65% | Labels, hints |
| Disabled Text | #475569 | 71, 85, 105 | 215°, 19%, 35% | Inactive UI |

---

## Code Examples

### CSS Variable Declaration

```css
:root {
  /* Colors */
  --color-accent: #00D9FF;
  --color-accent-dark: #00a8cc;
  --color-bg-primary: #0a0e27;
  --color-bg-secondary: #1a1f3a;
  --color-bg-tertiary: #2d3555;
  --color-text-primary: #f1f5f9;
  --color-text-secondary: #94a3b8;
  --color-status-critical: #EF4444;
  --color-status-warning: #F59E0B;
  --color-status-success: #10B981;
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  
  /* Typography */
  --type-h1: 1.75rem / 1.4 "Poppins", sans-serif;
  --type-body-md: 1rem / 1.6 "Poppins", sans-serif;
  
  /* Transitions */
  --transition-fast: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 300ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 500ms cubic-bezier(0.16, 1, 0.3, 1);
  
  /* Shadows */
  --shadow-md: 0 10px 30px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 20px 45px rgba(0, 0, 0, 0.4);
}
```

### Button Component (CSS)

```css
.button {
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: "Poppins", sans-serif;
}

.button--primary {
  background-color: var(--color-accent);
  color: var(--color-bg-primary);
  box-shadow: 0 0 20px rgba(0, 217, 255, 0.3);
}

.button--primary:hover {
  background-color: #33e6ff;
  box-shadow: 0 0 30px rgba(0, 217, 255, 0.6);
  transform: translateY(-2px);
}

.button--primary:active {
  background-color: var(--color-accent-dark);
  transform: translateY(0);
}

.button--primary:disabled {
  background-color: var(--color-text-disabled);
  color: #64748b;
  cursor: not-allowed;
  opacity: 0.5;
  box-shadow: none;
}
```

### Modal Animation (Framer Motion React)

```jsx
import { motion, AnimatePresence } from "framer-motion";

const Modal = ({ isOpen, onClose, title, children }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="modal"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ 
              duration: 0.35, 
              ease: [0.16, 1, 0.3, 1],
              delay: 0.05
            }}
          >
            <h1>{title}</h1>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
```

---

## Handoff Notes for Developers

1. **Font Loading**: Use `font-display: swap` in @font-face to prevent FOIT (flash of invisible text)
2. **Color Contrast**: Test all text/background combinations with WAVE or Lighthouse
3. **Animation Performance**: Use `transform` and `opacity` only (avoid `left`, `top`, etc.)
4. **Mobile First**: Write mobile styles first, then enhance with media queries
5. **CSS Variables**: Define all colors/spacing as CSS variables for consistency
6. **Component Naming**: Use BEM or similar methodology for predictable class names
7. **Testing**: Test keyboard navigation, screen readers, and 60fps performance
8. **Responsive Breakpoints**: Test at 320px (mobile), 768px (tablet), 1440px (desktop)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Sept 2026 | Initial design system for ARGUS |

---

**Design System Created For**: ARGUS (The All-Seeing Guardian)  
**Tagline**: "See Beyond the Surface"  
**Status**: Production-Ready for Implementation  
**Questions?** Reference this document when developing UI components.

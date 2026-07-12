# Header/Sidebar Visual Design Comparison — template-spa vs axionis-taller

Scope: this is a VISUAL-only refresh of axionis-taller's already-built Header/Sidebar (from the archived `home-layout-navigation` change). No new features (nav-search, notification bell, role filtering, submenu/collapse) are in scope — those were deliberately descoped in the prior change.

## (a) Side-by-side visual comparison

| Element | template-spa | axionis-taller (current) |
|---|---|---|
| Top bar bg/height/border | `h-16`, dark gradient `from-gray-700 via-gray-800 to-gray-900` (same in both themes), `border-b border-gray-300 dark:border-gray-800`, `shadow-sm`, `backdrop-blur-md bg-opacity-95 dark:bg-opacity-80` | `h-16`, `bg-white dark:bg-gray-900`, `border-b border-gray-200 dark:border-gray-800`, no shadow, no blur |
| Mobile toggle button | Always visible, `rounded-md p-2.5 text-gray-100 hover:bg-white/10` | `md:hidden` only, `rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700` |
| Avatar circle | `h-8 w-8 rounded-full bg-emerald-600 ring-2 ring-white dark:ring-gray-800 shadow-md` | `h-9 w-9 rounded-full bg-rose-500`, no ring, no shadow |
| Name/role block | Name inline + dropdown chevron; role shown only inside dropdown | Name + role stacked, role always visible as a pill, no dropdown |
| Theme toggle placement | Transparent (`hover:bg-white/10`), header bg is dark | Filled pill bg (`bg-gray-100 dark:bg-gray-800`), header bg is white |
| Logout button | Inside profile dropdown, full-width menu item | Standalone icon button in toolbar |
| Sidebar bg/width | `top-16`, collapsible `w-64 ↔ w-20`, dark gradient, `shadow-lg` | `inset-y-0`, fixed `w-64`, no collapse, `bg-white dark:bg-gray-900`, no shadow |
| Nav item spacing | `px-3 py-2.5`, `ml-3` icon/label gap, inline SVG icons, `transition-all duration-200` | `px-3 py-2`, `gap-3`, `<img>` SVG icons, bare `transition-colors` |
| Active-link treatment | `bg-white/10 text-emerald-300`; icon recolors via `currentColor` | `bg-rose-50 text-rose-600 dark:bg-rose-500/10`; icon does NOT recolor |
| Hover treatment | bg + text color shift (`hover:text-white`) | bg shift only, text unchanged |
| Dark mode | Chrome stays dark gradient in both themes | Chrome genuinely toggles white ↔ dark:gray-900 |

## (b) Concrete class-level diffs worth adopting
- Header: add `shadow-sm`.
- Avatar: add `ring-2 ring-white dark:ring-gray-800 shadow-md`.
- Sidebar: add `shadow-sm` (not template's `shadow-lg` — too heavy against a white sidebar).
- Nav-item transitions: `transition-colors duration-200` (template's `transition-all duration-200` minus the layout-affecting properties).
- Nav-item hover: add `hover:text-gray-900 dark:hover:text-white` alongside existing bg hover.
- template's `bg-white/10` translucent-overlay technique is NOT portable as-is — it's calibrated for a dark background. Axionis's `bg-rose-50`/`dark:bg-rose-500/10` flat-tint is already the correct light-mode analogue.

## (c) Tailwind v4-only syntax that can't be copied directly
- template-spa's `globals.css` uses v4 CSS-first `@theme`/`@custom-variant` — axionis (v3) already achieves the same dark-mode-variant behavior via `darkMode: 'class'`, nothing further needed.
- No Header/Sidebar class depends on a custom `@theme` token — every color is stock Tailwind palette, so there's no hard v4 blocker for a class-name-level port.
- `animate-fade-in-down` is referenced in template-spa's `Sidebar.tsx` but is **not defined** in its own `globals.css` (dead/broken reference in the reference project) — do not port as-is.
- `bg-opacity-95` combined with `bg-gradient-to-r` is questionable even in template-spa itself (`bg-opacity-*` doesn't affect gradients); if a glass effect is wanted, use slash syntax instead (`bg-white/95 dark:bg-gray-950/80`).

## (d) Custom brand color tokens — decision point
template-spa's `@theme inline` block defines only `--color-background`/`--color-foreground` + font tokens — **no locked brand color scale**. Every `emerald-*` class in Header/Sidebar is a plain stock-palette choice, not a design-system requirement. **Conclusion: template-spa's emerald look is a free choice, not a dependency.** Recommend keeping axionis's rose/red brand accent and porting only the spacing/shadow/ring/typography/transition polish (mentally substitute `emerald-*` → `rose-*` in any borrowed pattern) — pending user confirmation.

## (e) Recommended scoped visual changes

**Header.tsx**
1. Add `shadow-sm` to `<header>`.
2. Add `ring-2 ring-white dark:ring-gray-800 shadow-md` to the avatar circle.
3. Add explicit `duration-200` to icon-button hover transitions.
4. (Optional) Replace the `border-l ... pl-4` divider with an explicit `h-6 w-px bg-gray-200 dark:bg-gray-700` separator element.
5. Do NOT add search box, notification bell, or profile dropdown — explicitly descoped, out of scope for a visual-only refresh.

**Sidebar.tsx**
6. Add `shadow-sm` to `<aside>`.
7. Add `hover:text-gray-900 dark:hover:text-white` to nav-item hover states.
8. Bump nav-item transition to `transition-colors duration-200`.
9. **Known gap, not class-fixable**: axionis nav icons are `<img src="/icons/*.svg">` — cannot pick up `currentColor` text shifts the way template-spa's inline `<svg stroke="currentColor">` icons do. Full active/hover icon-recolor parity requires converting nav icons from `<img>` to inline SVG — an icon-architecture decision, separate from plain styling tweaks.
10. Keep axionis's "Axionis Taller" brand header block as-is.

**Cross-cutting**
11. Do NOT port template-spa's dark charcoal gradient chrome — it stays dark in both themes, which would contradict axionis's already-shipped theme-switching behavior (shell visibly responds to the toggle). Keep `bg-white dark:bg-gray-900`.

## Risks
- Icon color-parity requires an architecture change (`<img>` → inline SVG), not just class edits — separate decision.
- Rose vs. emerald is an open decision — do not assume adoption of template-spa's palette.
- Copying the dark gradient chrome literally would conflict with the shipped theme-switching spec.

## Ready for Proposal
Pending user confirmation on: (1) rose/red vs. emerald/template palette, (2) whether to invest in the `<img>` → inline-SVG icon conversion for active-state recoloring, or accept the current non-recoloring icons as-is.

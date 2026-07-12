# Proposal: Header/Sidebar Visual Refresh

## Intent
axionis-taller's dashboard shell (Header/Sidebar) is structurally complete but visually flat compared to template-spa's polish (no shadows, no avatar ring, abrupt hover/active transitions). Port the visual polish only — shadows, avatar ring, transition timing, hover text-color shift — while keeping axionis's rose/red brand palette and current icon architecture.

## Scope

### In Scope (Tailwind class edits only, no new components/behavior)
- `Header.tsx`: add `shadow-sm` to `<header>`; add `ring-2 ring-white dark:ring-gray-800 shadow-md` to the avatar circle; add explicit `duration-200` to icon-button hover transitions.
- `Sidebar.tsx`: add `shadow-sm` to `<aside>`; add `hover:text-gray-900 dark:hover:text-white` to nav-item hover state; bump nav-item transition to `transition-colors duration-200`.

### Out of Scope
- Color palette change (emerald) — explicitly declined, keep rose/red.
- Icon architecture change (`<img>` → inline SVG for active-state recoloring) — explicitly declined.
- Any new feature (nav-search, notification bell, role filtering, submenu/collapse, profile dropdown) — already descoped in the prior `home-layout-navigation` change.
- Dark charcoal gradient chrome — would conflict with the already-shipped theme-switching behavior (shell must keep responding to the toggle).

## Approach
Direct class-level edits to the two existing components. No new files, no dependency changes, no architecture decisions. Single small PR (well under the 400-line budget).

## Risks
None — purely additive Tailwind classes, no logic/behavior change, no security surface.

## Success Criteria
- [ ] Header has a visible shadow and the avatar has a ring.
- [ ] Sidebar has a visible shadow.
- [ ] Nav-item hover shifts both background and text color, with a smoother (200ms) transition.
- [ ] Dark mode and rose/red brand color unaffected.
- [ ] Visual check in browser (light + dark) confirms no regression to existing layout/spacing.

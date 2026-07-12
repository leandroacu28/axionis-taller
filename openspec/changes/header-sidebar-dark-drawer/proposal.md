# Proposal: Full-width Header + Drawer Sidebar + Fixed Dark Chrome

## Intent
User request: header must span the full screen width, the sidebar must be shown/hidden via a hamburger icon on the left (at all screen sizes, not just mobile), and header+sidebar must use a fixed dark-gray background with white text, matching the login page's dark aesthetic.

## Root cause of current layout (why header doesn't span full width today)
axionis-taller's `(dashboard)/layout.tsx` puts `<Sidebar/>` and `<Header/>+<main/>` as flex siblings. `Sidebar.tsx` currently has `md:static md:translate-x-0`, which makes it a normal (non-fixed) flex item on desktop — it reserves its own column, so Header (in the sibling column) never spans the full width.

Re-read template-spa's actual `(dashboard)/layout.tsx`/`Header.tsx`/`Sidebar.tsx` (not just the earlier structural exploration) to confirm the real mechanism: template-spa's `Sidebar` is **always** `fixed left-0 top-16 ...` — it never has an `md:static` desktop exception. Because a `fixed` element is taken out of normal flow, the sibling flex column (Header+main) naturally fills 100% of the viewport width at every screen size. The sidebar becomes a **drawer**: hidden by default (`-translate-x-full`), toggled open/closed by the hamburger button in the header, and overlays on top of the content (with a click-to-dismiss backdrop) rather than pushing it over. This is exactly the behavior requested ("mostrar y ocultar el navbar" via the hamburger).

## Scope

### In Scope
- `client/app/(dashboard)/layout.tsx`: no structural change needed beyond what Sidebar/Header already do — confirm `sidebarOpen` starts `false` (hidden by default).
- `client/app/components/layout/Sidebar.tsx`:
  - Remove `md:static md:translate-x-0` — sidebar is `fixed` at all screen sizes (drawer, not a permanent column).
  - Reposition to `top-16 h-[calc(100vh-4rem)]` (starts below the now-full-width header) instead of `inset-y-0`.
  - Background becomes fixed dark (`bg-stone-900`, no `dark:` split — always dark regardless of the site theme toggle), matching the login page's `stone-900` panel.
  - All text/icon/border colors updated for a permanently-dark surface (white/light-gray text, `border-stone-800` or `border-white/10` dividers, `hover:bg-white/10 hover:text-white`).
  - Active-link accent stays rose (brand color decision from the prior visual-refresh change still holds) — e.g. `bg-white/10 text-rose-400`.
- `client/app/components/layout/Header.tsx`:
  - Remove `md:hidden` from the sidebar-toggle (hamburger) button so it's visible and functional at every screen size, not just mobile. It already sits at the far-left of the header — no position change needed.
  - Background becomes fixed dark (`bg-stone-900`, no `dark:` split), matching Sidebar and the login page.
  - All text/icon/border colors updated for a permanently-dark surface (name text → white, role badge → `bg-white/10 text-gray-300`, avatar ring → `ring-stone-900`/`ring-white/20`, dividers → `border-white/10`, icon buttons → `text-gray-300 hover:text-white hover:bg-white/10`).
  - `<ThemeToggle/>` stays functional — it continues to affect `<main>` and the rest of the app's light/dark mode; header/sidebar chrome simply no longer visually reacts to it (matches template-spa's actual behavior, where the chrome is dark in both themes).

### Out of Scope
- Any change to `<main>` content theming, nav item list (still Inicio/Usuarios/Configuraciones Generales), or backend.
- Collapsible width (`w-64 ↔ w-20`) — not requested, current fixed `w-64` stays.
- Submenu/nested nav items — still no items have `children`.
- Nav-search box, notification bell, profile dropdown — still explicitly out of scope per the original `home-layout-navigation` change.

## Risks
- Desktop users lose the "always-visible sidebar" — after this change, the sidebar starts hidden and must be opened via the hamburger, on ALL screen sizes (not just mobile). This is a deliberate behavior change per the explicit request ("mostrar y ocultar"), not an oversight — flagging so it's an informed tradeoff.
- Fixed dark chrome means header/sidebar no longer participate in the light/dark theme toggle — also deliberate per "estética acorde con el login" (login's branding panel is always dark, not theme-reactive either).

## Success Criteria
- [ ] Header spans the full viewport width on all screen sizes.
- [ ] Hamburger icon is visible at the far left of the header at all screen sizes and toggles the sidebar open/closed.
- [ ] Sidebar is hidden by default, opens as a drawer overlay (with click-outside-to-dismiss backdrop) below the header.
- [ ] Header and sidebar both render with a solid dark-gray (`stone-900`) background and white/light-gray text, unaffected by the light/dark theme toggle.
- [ ] Rose active-link accent, avatar, and logout button remain functional and legible against the new dark background.

## Addendum: gradient blend with login (2026-07-07, same session)
Follow-up request: solid `stone-900` read as too flat — user asked to blend the chrome color with the login page's actual palette for a more "professional and technological" tone. Changed both `Header.tsx` and `Sidebar.tsx` from flat `bg-stone-900` to `bg-gradient-to-r`/`bg-gradient-to-b from-stone-900 via-rose-950 to-stone-900` — the exact gradient stops used on the login page's branding panel. Verified visually: legible white text and rose-400 active-link accent hold up against the gradient at both ends and the rose-tinted middle.

# Theme Switching Specification

## Requirements

### Requirement: Tailwind V3 Class-Based Dark Mode
`tailwind.config.ts` MUST set `darkMode: 'class'` and `globals.css` MUST keep standard Tailwind v3 `@tailwind` directives (base/components/utilities) — v4 CSS-first syntax (`@theme`, `@custom-variant`) MUST NOT be introduced.

#### Scenario: Dark mode is class-driven, not media-driven
- GIVEN `tailwind.config.ts` is configured
- WHEN the app builds
- THEN dark-mode utility classes activate based on the `.dark` class, not the OS `prefers-color-scheme` media query

### Requirement: Theme Provider and Toggle
`ThemeProvider`/`useTheme` MUST expose the current theme and a toggle function; `ThemeToggle` MUST invoke that toggle when activated.

#### Scenario: Toggling switches the html class
- GIVEN the app is rendered in light mode
- WHEN the user activates `ThemeToggle`
- THEN the `.dark` class is added to (or removed from) the `<html>` element accordingly

### Requirement: Theme Preference Persistence
The selected theme preference MUST persist to `localStorage`, independently of session state.

#### Scenario: Preference survives reload
- GIVEN the user has toggled to dark mode
- WHEN the page is reloaded
- THEN the `.dark` class is re-applied to `<html>` based on the persisted `localStorage` value

### Requirement: Theme State Is Distinct From Session State
Theme preference persistence MUST NOT read from, write to, or otherwise depend on the `token`/`user` session cookies, and clearing the theme's `localStorage` key MUST NOT affect the session cookies or vice versa.

#### Scenario: Logout does not reset theme
- GIVEN the user has selected dark mode
- WHEN the user logs out (session cookies cleared)
- THEN the persisted theme preference in `localStorage` remains unchanged

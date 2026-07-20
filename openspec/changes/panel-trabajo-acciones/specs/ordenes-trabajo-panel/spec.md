# Delta for Órdenes de Trabajo Panel

## MODIFIED Requirements

### Requirement: Board Has No Drag-and-Drop; Explicit Action Controls Are Permitted

Kanban cards MUST NOT support drag-to-change-estado; dragging a card MUST NOT mutate the order's `estado`. This capability MUST NOT add any drag-and-drop library or other new runtime dependency to `client/package.json`. Kanban cards MAY expose explicit, non-drag action controls (e.g. buttons or a menu triggered by click/tap) that perform a mutation via an existing, already-established API call — such controls are permitted and are specified by the "Kanban Card Actions Menu" requirement and its siblings below; they are not drag-and-drop and do not constitute a new write-interaction ban violation.

#### Scenario: Dragging a card does not change its estado

- GIVEN a card is rendered in one of the board's columns
- WHEN a user attempts to drag that card
- THEN the order's `estado` is not modified and the card remains in its original column after the interaction

#### Scenario: No drag-and-drop dependency is introduced

- GIVEN this capability is implemented
- WHEN `client/package.json` is inspected
- THEN no new drag-and-drop library has been added as a dependency

## ADDED Requirements

### Requirement: Kanban Card Actions Menu

Each Kanban card MUST expose an icon-triggered dropdown menu offering the following actions, subject to the visibility and behavior rules of the requirements below: Iniciar, Editar, Desactivar. This menu and its handlers MUST be implemented within the panel's own files (e.g. `client/app/(dashboard)/ordenes-trabajo/panel/KanbanBoard.tsx` and/or a new sibling file under `panel/`); it MUST NOT be imported from, nor require any change to, `client/app/(dashboard)/ordenes-trabajo/page.tsx`.

#### Scenario: Card exposes an actions menu

- GIVEN a card is rendered in any of the board's columns
- WHEN the user triggers the card's action icon
- THEN a dropdown menu opens exposing the actions applicable to that card per the visibility rules below

#### Scenario: Actions menu is implemented independently of the list page

- GIVEN this capability is implemented
- WHEN `client/app/(dashboard)/ordenes-trabajo/page.tsx` is inspected
- THEN it contains no reference to, or dependency from, the panel's actions menu component, and is unchanged in the diff

### Requirement: Iniciar Visibility Rule

The Iniciar action MUST appear in the actions menu of cards whose `estado` is `pendiente`, `en_proceso`, or `terminado`. The Iniciar action MUST NOT appear in the actions menu of cards whose `estado` is `cancelado`.

#### Scenario: Iniciar appears on a pendiente card

- GIVEN a card whose order has `estado: 'pendiente'`
- WHEN the card's actions menu is opened
- THEN the Iniciar action is present

#### Scenario: Iniciar appears on an en_proceso card

- GIVEN a card whose order has `estado: 'en_proceso'`
- WHEN the card's actions menu is opened
- THEN the Iniciar action is present

#### Scenario: Iniciar appears on a terminado card

- GIVEN a card whose order has `estado: 'terminado'`
- WHEN the card's actions menu is opened
- THEN the Iniciar action is present

#### Scenario: Iniciar is absent on a cancelado card

- GIVEN a card whose order has `estado: 'cancelado'`
- WHEN the card's actions menu is opened
- THEN the Iniciar action is not present

### Requirement: Iniciar Dual Behavior Mirrors the List Page's Iniciar Control

The Iniciar action MUST reproduce the same dual behavior as the list page's `IniciarTrabajoButton`, branching strictly on the card's current `estado`:

- On a card whose `estado` is `pendiente`, clicking Iniciar MUST call `POST /ordenes-trabajo/:id/iniciar` for that order; on success it MUST trigger a re-fetch of the panel (per the "Post-Action Panel Refresh" requirement below) and then navigate to `/ordenes-trabajo/:id/trabajo`.
- On a card whose `estado` is `en_proceso` or `terminado` (i.e. any estado where Iniciar is visible other than `pendiente`), clicking Iniciar MUST navigate directly to `/ordenes-trabajo/:id/trabajo` WITHOUT calling `POST /ordenes-trabajo/:id/iniciar`.
- Neither branch MUST show a confirmation dialog before acting.
- If the `POST /ordenes-trabajo/:id/iniciar` call fails on a `pendiente` card, the failure MUST surface via the existing error notification mechanism and MUST NOT navigate to the work page.

#### Scenario: Iniciar on a pendiente card calls the cascade then navigates

- GIVEN a card whose order has `estado: 'pendiente'`
- WHEN the user clicks Iniciar on that card
- THEN `POST /ordenes-trabajo/:id/iniciar` is called for that order's id
- AND on success the panel re-fetches its filtered data
- AND the user is navigated to `/ordenes-trabajo/:id/trabajo`
- AND no confirmation dialog is shown at any point

#### Scenario: Iniciar on a non-pendiente card navigates without calling the API

- GIVEN a card whose order has `estado: 'en_proceso'` or `estado: 'terminado'`
- WHEN the user clicks Iniciar on that card
- THEN `POST /ordenes-trabajo/:id/iniciar` is NOT called
- AND the user is navigated directly to `/ordenes-trabajo/:id/trabajo`
- AND no confirmation dialog is shown at any point
- AND no error notification is shown, since no API call was made and no 409 can occur

### Requirement: Editar Action Navigates Without Confirmation

The Editar action MUST be a plain navigation link to `/ordenes-trabajo/editar/:id` for the card's order. It MUST NOT show a confirmation dialog before navigating.

#### Scenario: Editar navigates directly to the edit route

- GIVEN a card for an order with a given id
- WHEN the user clicks Editar on that card
- THEN the user is navigated to `/ordenes-trabajo/editar/:id` for that order's id, with no confirmation dialog shown

### Requirement: Desactivar Action Confirms, Sends a Full-Object PATCH, and Notifies

The Desactivar action MUST show a confirmation dialog before acting. On confirm, it MUST call `PATCH /ordenes-trabajo/:id` with the order's full existing field set (the same fields already sent by the list page's deactivate flow) plus `activo: false` — not a minimal/partial payload containing only `activo`. On a successful response it MUST show a success notification and trigger a re-fetch of the panel (per the "Post-Action Panel Refresh" requirement below). On a failed response it MUST show an error notification and MUST NOT trigger a panel re-fetch. On cancel, it MUST make no API call and MUST leave the card unchanged.

#### Scenario: Confirming Desactivar sends a full-object PATCH and refreshes on success

- GIVEN a card for an active order
- WHEN the user clicks Desactivar and confirms the dialog
- THEN `PATCH /ordenes-trabajo/:id` is called with the order's full existing field set plus `activo: false`
- AND on success a success notification is shown
- AND the panel re-fetches its filtered data

#### Scenario: Canceling Desactivar makes no API call

- GIVEN a card for an active order
- WHEN the user clicks Desactivar and cancels the confirmation dialog
- THEN `PATCH /ordenes-trabajo/:id` is NOT called
- AND the card remains unchanged on the board

### Requirement: Post-Action Panel Refresh

After any of the three card actions (Iniciar's cascade path on a `pendiente` card, or Desactivar's confirmed path) completes successfully, the panel MUST re-fetch the entire filtered panel response (stats and board data together, from the same request), using the same re-fetch convention already used after any filter change. No optimistic or local-only card update MUST be used as a substitute for this re-fetch.

#### Scenario: A successful Iniciar cascade triggers a full panel re-fetch

- GIVEN a card whose order has `estado: 'pendiente'`
- WHEN the user clicks Iniciar and the `POST /ordenes-trabajo/:id/iniciar` call succeeds
- THEN the panel re-fetches its entire filtered response (stats and board together), not just the affected card

#### Scenario: A successful Desactivar triggers a full panel re-fetch

- GIVEN a card for an active order
- WHEN the user confirms Desactivar and the `PATCH /ordenes-trabajo/:id` call succeeds
- THEN the panel re-fetches its entire filtered response (stats and board together), not just the affected card

### Requirement: Deactivated Card Disappears From the Board

Because the panel's filtered query unconditionally excludes orders with `activo: false`, after a successful Desactivar and the subsequent panel re-fetch, the affected order's card MUST no longer appear in any column of the board. No additional transition, warning, or animation beyond the existing confirmation dialog and success notification is required.

#### Scenario: A deactivated order's card is gone after refresh

- GIVEN a card for an active order is visible on the board
- WHEN the user confirms Desactivar for that order and the panel re-fetches
- THEN that order's card does not appear in any column of the board

### Requirement: List Page and Other Panel Sections Are Unaffected

This capability MUST NOT modify `client/app/(dashboard)/ordenes-trabajo/page.tsx`, the panel's stats/summary row, the panel's filter bar, or the "Carga por mecánico" section. It MUST NOT change the request or response contract of `GET /ordenes-trabajo/panel` or `GET /ordenes-trabajo/panel/mecanicos`.

#### Scenario: List page is unchanged

- GIVEN this capability is implemented
- WHEN `client/app/(dashboard)/ordenes-trabajo/page.tsx` is inspected
- THEN its behavior and contents are unchanged from before this capability

#### Scenario: Other panel sections and endpoints are unchanged

- GIVEN this capability is implemented
- WHEN the panel's stats row, filter bar, "Carga por mecánico" section, and the `GET /ordenes-trabajo/panel` / `GET /ordenes-trabajo/panel/mecanicos` endpoints are inspected
- THEN their behavior and contracts are unchanged from before this capability

### Requirement: No New Backend Surface Is Introduced

`POST /ordenes-trabajo/:id/iniciar` and `PATCH /ordenes-trabajo/:id`, their DTOs, and their guards MUST remain exactly as specified by their existing capabilities. This capability MUST NOT modify them, and MUST NOT introduce any new backend endpoint, DTO, guard, or migration.

#### Scenario: Existing iniciar and update endpoints are unmodified

- GIVEN this capability is implemented
- WHEN `POST /ordenes-trabajo/:id/iniciar` and `PATCH /ordenes-trabajo/:id` (including their DTOs and guards) are inspected
- THEN their request/response contracts, validation rules, and guards are identical to their behavior before this capability

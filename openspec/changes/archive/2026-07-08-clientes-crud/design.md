# Design: Clientes CRUD (Create, List, Update)

## Technical Approach

Add a NestJS `customers` module that is structurally identical to the current `users/` module (thin controller guarded by `JwtAuthGuard`, service owns every Prisma call, explicit `class-validator` DTOs, `CUSTOMER_SELECT` whitelist, TOCTOU-safe duplicate handling with a `P2002` backstop), plus a `client/app/(dashboard)/clientes/` route group (`page.tsx` / `nuevo` / `editar/[id]`) and a `lib/customers.ts` fetch wrapper that mirrors `lib/users.ts` field-for-field. Unlike `usuarios-crud`, this change **does** require a real additive Prisma migration: a new `Cliente` model with two nullable cross-model FKs to `User` (`creadoPor`, `actualizadoPor`). No existing table, endpoint, or page behavior changes — the only edits to existing files are two back-relation arrays on `User`, one `app.module.ts` import, and one nav entry.

The only two genuinely novel design decisions are (1) the back-relation naming on `User` (the first cross-model audit FK, declared twice, must not clash with the existing `creados` self-relation) and (2) the `tipo`-keyed conditional identificación validation mechanism. Both are documented in Architecture Decisions. Everything else mirrors `users` verbatim so a future reader finds parallel modules, not divergent conventions.

## Data Model

### `Cliente` model (new) — `server/prisma/schema.prisma`

```prisma
model Cliente {
  id                 Int      @id @default(autoincrement())
  razonSocial        String
  tipoIdentificacion String
  identificacion     String   @unique
  telefono           String
  domicilio          String
  activo             Boolean  @default(true)
  creadoPorId        Int?
  creadoPor          User?    @relation("ClienteCreadoPor", fields: [creadoPorId], references: [id], onDelete: SetNull)
  actualizadoPorId   Int?
  actualizadoPor     User?    @relation("ClienteActualizadoPor", fields: [actualizadoPorId], references: [id], onDelete: SetNull)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

- `tipoIdentificacion` is a plain `String`, app-validated via `@IsIn(ID_TYPES)` — no Prisma enum, matching the `User.rol` precedent.
- `identificacion` carries a single-column `@unique` (D1) — global uniqueness on the ID string alone, not composite with `tipoIdentificacion`, mirroring `User.dni @unique`.
- `telefono` and `domicilio` are non-null (required). See Risks for the one-line relaxation path if the product later wants them optional.
- Both audit FKs are nullable with `onDelete: SetNull` (D5) — removing a staff `User` nulls the reference instead of deleting or blocking the cliente row.

### `User` model back-relations (modify) — `server/prisma/schema.prisma`

Prisma requires the inverse side of each relation on `User`. Add two array back-relations, named to avoid clashing with the existing self-relation `creados @relation("UserCreatedBy")`:

```prisma
model User {
  // ...existing fields unchanged...
  clientesCreados     Cliente[] @relation("ClienteCreadoPor")
  clientesActualizados Cliente[] @relation("ClienteActualizadoPor")
}
```

### Migration

This change **requires** `npx prisma migrate dev --name add_cliente` run in `server/` — it creates the `Cliente` table and its two FK constraints. This is an **apply-phase** step (`sdd-apply` runs it), NOT something this design phase runs. `sdd-apply` MUST confirm the reachable `DATABASE_URL` in `server/.env` points at the intended MySQL instance before migrating (see Migration / Rollout).

## Backend Module Structure

`server/src/customers/` mirrors `users/`:

| File | Contents |
|------|----------|
| `customers.controller.ts` | `@Controller('customers')`, `@UseGuards(JwtAuthGuard)` at class level; `@Get()`, `@Get(':id')`, `@Post()`, `@Patch(':id')`; wires `req.user.userId` into create/update |
| `customers.service.ts` | `findAll()`, `findOne(id)`, `create(dto, creadoPorId)`, `update(id, dto, actualizadoPorId)`; owns every Prisma call; `CUSTOMER_SELECT` + `uniqueTargetIncludes` |
| `customers.module.ts` | `controllers: [CustomersController]`, `providers: [CustomersService]` |
| `customer.constants.ts` | `ID_TYPES`, `IdType`, `ID_TYPE_PATTERNS`, `ID_TYPE_LABELS` |
| `dto/identificacion.validator.ts` | custom `@IsIdentificacionValida()` constraint (reads sibling `tipoIdentificacion`) |
| `dto/create-customer.dto.ts` | see below |
| `dto/update-customer.dto.ts` | see below |

### Constants — `customer.constants.ts`

```ts
/**
 * Valid tipoIdentificacion values — keep create/update DTOs in sync via this.
 * No shared package exists between server/client, so this list is duplicated
 * at client/app/lib/customers.ts — if you change one, change the other.
 */
export const ID_TYPES = ['dni', 'cuit', 'cuil'] as const;
export type IdType = (typeof ID_TYPES)[number];

/** Post-normalization (digits-only) length patterns per tipo. */
export const ID_TYPE_PATTERNS: Record<IdType, RegExp> = {
  dni: /^\d{7,8}$/,
  cuit: /^\d{11}$/,
  cuil: /^\d{11}$/,
};

export const ID_TYPE_LABELS: Record<IdType, string> = {
  dni: 'DNI',
  cuit: 'CUIT',
  cuil: 'CUIL',
};
```

### Custom validator — `dto/identificacion.validator.ts`

```ts
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ID_TYPE_PATTERNS, IdType } from '../customer.constants';

@ValidatorConstraint({ name: 'identificacionValida', async: false })
export class IdentificacionValidaConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const tipo = (args.object as { tipoIdentificacion?: string }).tipoIdentificacion as IdType;
    const pattern = ID_TYPE_PATTERNS[tipo];
    if (!pattern) return false; // unknown/absent tipo — @IsIn already reports it separately
    return typeof value === 'string' && pattern.test(value);
  }

  defaultMessage(args: ValidationArguments): string {
    const tipo = (args.object as { tipoIdentificacion?: string }).tipoIdentificacion;
    if (tipo === 'dni') return 'El DNI debe tener 7 u 8 dígitos.';
    if (tipo === 'cuit' || tipo === 'cuil') return 'El CUIT/CUIL debe tener 11 dígitos.';
    return 'Identificación inválida.';
  }
}

export function IsIdentificacionValida(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'identificacionValida',
      target: object.constructor,
      propertyName,
      options,
      validator: IdentificacionValidaConstraint,
    });
  };
}
```

### DTOs (every field explicit — global `whitelist: true` silently strips unknowns)

Normalization happens **in the DTO** via a class-transformer `@Transform` that strips every non-digit (dots, dashes, spaces) from `identificacion`. Because class-transformer runs the transform during `plainToClass` *before* class-validator runs, the length pattern and the eventual Prisma write both see the already-normalized digits-only string — a single source of truth, no separate service-side normalization step (see Architecture Decisions).

```ts
// create-customer.dto.ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ID_TYPES, IdType } from '../customer.constants';
import { IsIdentificacionValida } from './identificacion.validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  razonSocial: string;

  @IsIn(ID_TYPES)
  tipoIdentificacion: IdType;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @IsString()
  @IsNotEmpty()
  @IsIdentificacionValida()
  identificacion: string;

  @IsString()
  @IsNotEmpty()
  telefono: string;

  @IsString()
  @IsNotEmpty()
  domicilio: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
```

```ts
// update-customer.dto.ts — same shape (no immutable-by-omission field here;
// unlike users' username, every cliente field is editable). Mirrors the
// current update-user.dto.ts style of repeating the full field set.
export class UpdateCustomerDto {
  @IsString()
  @IsNotEmpty()
  razonSocial: string;

  @IsIn(ID_TYPES)
  tipoIdentificacion: IdType;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @IsString()
  @IsNotEmpty()
  @IsIdentificacionValida()
  identificacion: string;

  @IsString()
  @IsNotEmpty()
  telefono: string;

  @IsString()
  @IsNotEmpty()
  domicilio: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
```

### Service — `customers.service.ts`

Mirrors `users.service.ts`'s `USER_SELECT` whitelist and `uniqueTargetIncludes` TOCTOU pattern (whitelist over destructuring so a future sensitive column can't leak; target-aware `P2002` so the backstop names the field that actually collided — here only `identificacion` is unique, but the pattern is kept for consistency and forward safety).

```ts
const CUSTOMER_SELECT = {
  id: true,
  razonSocial: true,
  tipoIdentificacion: true,
  identificacion: true,
  telefono: true,
  domicilio: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  creadoPor: { select: { id: true, username: true } },
  actualizadoPor: { select: { id: true, username: true } },
};

const DUPLICATE_ID_ERROR = 'La identificación ya está registrada.';
```

Reuse the exact `uniqueTargetIncludes(error, field)` helper from `users.service.ts` (checks `Prisma.PrismaClientKnownRequestError` + `P2002` + `error.meta.target` includes the constraint name, e.g. `Cliente_identificacion_key`).

- **`findAll()`** → `prisma.cliente.findMany({ select: CUSTOMER_SELECT })`. Full set, no query params — client-side filtering (D3), matching `GET /users`.
- **`findOne(id)`** → `findUnique({ where: { id }, select: CUSTOMER_SELECT })`; if missing `throw new NotFoundException('Cliente no encontrado.')`.
- **`create(dto, creadoPorId)`** → pre-check `findUnique({ where: { identificacion: dto.identificacion } })`; if found `throw new ConflictException(DUPLICATE_ID_ERROR)`. Then `prisma.cliente.create({ data: { ...fields, creadoPorId, actualizadoPorId: creadoPorId }, select: CUSTOMER_SELECT })` — **both** audit stamps set to the caller on creation (proposal scope). Wrap in `try/catch`; on `uniqueTargetIncludes(error, 'identificacion')` re-throw as the same `ConflictException` (TOCTOU backstop for the non-atomic pre-check).
- **`update(id, dto, actualizadoPorId)`** → `findUnique({ where: { id } })`; if missing `throw new NotFoundException('Cliente no encontrado.')`. Duplicate check with `findFirst({ where: { identificacion: dto.identificacion, NOT: { id } } })` (allows the row to keep its own value, blocks another row's). Build `data` from the DTO fields and set `actualizadoPorId` — **never** touch `creadoPorId` (immutable after creation). `prisma.cliente.update({ where: { id }, data: { ...fields, actualizadoPorId }, select: CUSTOMER_SELECT })` inside the same `try/catch` backstop. There is **no** self/master-lockout guard (D6) — clientes don't authenticate and nothing references them yet, so the narrow `activo` guards from `users.service.ts` don't apply.

### Controller — `customers.controller.ts`

Identical shape to `users.controller.ts`: class-level `@UseGuards(JwtAuthGuard)`, `@Get()` / `@Get(':id')` (with `ParseIntPipe`) / `@Post()` / `@Patch(':id')`. Caller id resolved server-side from the JWT, never client-suppliable:

```ts
@Post()
async create(
  @Body() dto: CreateCustomerDto,
  @Request() req: { user: { userId: number; username: string } },
) {
  return this.customersService.create(dto, req.user.userId);
}

@Patch(':id')
async update(
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: UpdateCustomerDto,
  @Request() req: { user: { userId: number; username: string } },
) {
  return this.customersService.update(id, dto, req.user.userId); // → actualizadoPorId
}
```

### Module registration — `server/src/app.module.ts`

```ts
import { CustomersModule } from './customers/customers.module';
// imports: [ ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, UsersModule, CustomersModule ]
```

## Frontend

### `client/app/lib/customers.ts`

Mirrors `lib/users.ts` exactly — duplicated `ID_TYPES`/labels (no shared package), list-item interface with the nested audit display fields, `Create*Payload`/`Update*Payload`, shared `handleJsonResponse<T>()`, `getAuthHeader()` on every call.

```ts
import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';

// Duplicated from server/src/customers/customer.constants.ts — change one, change the other.
export const ID_TYPES = ['dni', 'cuit', 'cuil'] as const;
export type IdType = (typeof ID_TYPES)[number];
export const ID_TYPE_LABELS: Record<IdType, string> = { dni: 'DNI', cuit: 'CUIT', cuil: 'CUIL' };
export function toIdType(value: string): IdType {
  return (ID_TYPES as readonly string[]).includes(value) ? (value as IdType) : 'dni';
}

export interface CustomerListItem {
  id: number;
  razonSocial: string;
  tipoIdentificacion: string;
  identificacion: string;
  telefono: string;
  domicilio: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  creadoPor: { id: number; username: string } | null;
  actualizadoPor: { id: number; username: string } | null;
}

export interface CreateCustomerPayload {
  razonSocial: string;
  tipoIdentificacion: IdType;
  identificacion: string;
  telefono: string;
  domicilio: string;
  activo?: boolean;
}

export interface UpdateCustomerPayload {
  razonSocial: string;
  tipoIdentificacion: IdType;
  identificacion: string;
  telefono: string;
  domicilio: string;
  activo?: boolean;
}
```

Functions mirror `lib/users.ts` one-for-one against `/customers`: `listCustomers()` (GET), `getCustomer(id)` (GET `/customers/${id}`), `createCustomer(data)` (POST), `updateCustomer(id, data)` (PATCH `/customers/${id}`) — same `handleJsonResponse` wrapper, same Spanish fallback messages ("No se pudo obtener la lista de clientes", etc.).

### `client/app/(dashboard)/clientes/page.tsx` (list, `'use client'`)

Reuses the **current** usuarios list page pattern field-for-field (D3): one titled filter card containing a search box + status `<select>` + page-size `<select>`, an active-count pill above it, a data-table card, dropdown-via-`createPortal` row actions (with `openUpward` flip + click-outside/scroll/resize close via `triggerRef`/`menuRef`), and a pagination footer. State: `customers`, `loading`, `listError`, `openMenuId`, `menuPos`, `togglingId`, `search`, `statusFilter` (`DEFAULT_STATUS_FILTER = 'activo'`), `page`, `pageSize` (`PAGE_SIZE_OPTIONS = [10, 25, 50]`). `useEffect` load via `listCustomers()`.

Differences from usuarios, all deliberate:
- **Search haystack** = `[razonSocial, identificacion, telefono]` (D4 — skip domicilio), replacing usuarios' `[nombre, apellido, username, dni]`. Placeholder: "Razón social, identificación o teléfono...".
- **Table columns**: Razón Social · Tipo (`ID_TYPE_LABELS[toIdType(tipoIdentificacion)]` badge) · Identificación · Teléfono · Estado · Acciones. (Domicilio omitted from the table to keep it scannable, matching usuarios' choice to show key fields only; it's still editable on the form.)
- **Row actions**: "Editar" (`/clientes/editar/${id}`) + "Activar/Desactivar" toggle. The toggle sends the full required payload with `activo` flipped — `updateCustomer(c.id, { razonSocial, tipoIdentificacion: toIdType(c.tipoIdentificacion), identificacion, telefono, domicilio, activo: !c.activo })` — then `loadCustomers()`. Deactivate shows a `showConfirm` first; success/error via `showSuccess`/`showError`. **No** master/self-lockout blocking (D6) — the guard logic and `deactivateBlockedReason` from usuarios are dropped; the toggle is always enabled.
- Empty/error/loading/no-results states, "Nuevo cliente" header button (`/clientes/nuevo`), and all styling (rose/red gradient primary, stone borders, green/rose status pills) copied verbatim.

### `client/app/(dashboard)/clientes/nuevo/page.tsx` (create)

Mirrors the current usuarios `nuevo/page.tsx`: `FormState` + generic `updateField`, required-field validation before submit (`razonSocial`, `tipoIdentificacion`, `identificacion`, `telefono`, `domicilio`), `showError` on empty, `createCustomer(payload)` call, `showSuccess` + `router.push('/clientes')`, `showError` in catch. `tipoIdentificacion` is a `<select>` over `ID_TYPES` with `ID_TYPE_LABELS`. No password block (clientes don't authenticate). `EMPTY_FORM` defaults `tipoIdentificacion: 'dni'`, `activo` implicitly true server-side.

### `client/app/(dashboard)/clientes/editar/[id]/page.tsx` (edit)

Mirrors the current usuarios `editar/[id]/page.tsx`: `useEffect` load via `getCustomer(userId)` with the `cancelled` unmount guard, loading/error/form states, `FormState` + `updateField`, required-field validation, `updateCustomer(id, payload)` on submit, toasts, `router.push('/clientes')`. No master-account role-lock (that was usuarios-specific); every field editable. `activo` is preserved by re-sending the loaded value (the edit form does not expose a status toggle — status is managed from the list, matching usuarios).

#### Unsaved-edit discard warning (genuinely new — not mirrored)

The spec's "Edit Customer Page" requirement mandates a `showConfirm` warning before discarding unsaved edits when the user navigates away. This is **not** present in the current usuarios `editar/[id]/page.tsx` (verified: no `beforeunload`, no navigation guard, no dirty-state tracking anywhere in `client/`), so it must be designed here rather than pointed at an existing implementation.

**1. Dirty-state tracking.** On successful load, keep the loaded record as the baseline: initialize `form` from `getCustomer(id)` and store the same normalized values in an `initialFormRef` (`useRef<FormState | null>`). Derive `isDirty` by shallow-comparing every `FormState` field against `initialFormRef.current` (a memoized helper `isFormDirty(form, initialFormRef.current)`), rather than a manually-maintained boolean — this stays correct even when a user edits a field back to its original value (no false-positive prompt). Reset the baseline on two events: (a) successful load (`initialFormRef.current = loaded`), and (b) successful save (`initialFormRef.current = form` immediately before `router.push('/clientes')`, so the post-save navigation never trips the guard).

**2. In-app navigation guard (uses `alerts.ts` `showConfirm`).** Convert the "Cancelar" **`Link`** into a `button` with an async `onClick` handler. When `isDirty` is false it calls `router.push('/clientes')` directly; when `isDirty` is true it awaits `showConfirm(...)` first and only navigates on confirmation:

```tsx
const handleCancel = async () => {
  if (isDirty) {
    const confirmed = await showConfirm({
      title: 'Descartar cambios',
      text: 'Tenés cambios sin guardar. ¿Seguro que querés salir sin guardar?',
      confirmButtonText: 'Sí, descartar',
      confirmButtonColor: '#e11d48',
    });
    if (!confirmed) return; // stay on the page, editing preserved
  }
  router.push('/clientes');
};
```

This matches the exact `showConfirm` usage already in `client/app/(dashboard)/usuarios/page.tsx` (the deactivate-confirmation: same awaited boolean return, same `confirmButtonColor: '#e11d48'` destructive-action red, same `if (!confirmed) return;` early-out). Requires `import { showConfirm } from '../../../lib/alerts'` (alongside the existing `showError`/`showSuccess`) and `useRouter` (already imported for the post-save push). This is the primary guard and satisfies the spec's explicit `alerts.ts` requirement.

**3. Native `beforeunload` for tab-close/refresh (separate mechanism, complementary).** `showConfirm`'s SweetAlert2 modal **cannot** intercept a browser tab-close, refresh, or hard back-navigation — browsers only allow a native, non-customizable confirm dialog for that lifecycle event. To cover that case, add a native listener guarded by `isDirty`:

```tsx
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = ''; // required for Chrome to show the native prompt
    }
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [isDirty]);
```

These are two distinct mechanisms for two distinct exit paths and both are intentional: the `showConfirm` modal handles **in-app Next.js routing** (Cancelar and any router-driven exit), while `beforeunload` handles the **browser-level** tab-close/refresh where a custom modal is impossible. The native dialog's text is browser-controlled and cannot be styled; that is a platform constraint, not a design gap.

### `client/app/lib/navigation.tsx` — new "Clientes" entry

Add a **new top-level** entry (sibling of "Inicio"), not nested under "Configuraciones":

```tsx
{
  name: 'Clientes',
  href: '/clientes',
  id: 'clientes',
  icon: <img src="/icons/clientes.svg" alt="" className="h-5 w-5" aria-hidden />,
},
```

**Reasoning**: "Configuraciones" groups system-administration items (Usuarios = staff accounts). Clientes is core operational business data the shop works with daily, not a configuration surface — so it belongs at the top level for direct access, parallel to "Inicio", rather than buried in an admin group. (An `/icons/clientes.svg` asset is a small apply-phase addition; if absent, reuse an existing icon to avoid a broken image.)

## Architecture Decisions

### Decision: back-relation naming on `User` for the audit FKs
**Choice**: `clientesCreados @relation("ClienteCreadoPor")` and `clientesActualizados @relation("ClienteActualizadoPor")` on `User`, with the forward sides `creadoPor`/`actualizadoPor` on `Cliente`.
**Alternatives**: (a) reuse short names like `creados`/`actualizados` — **rejected**: `creados` is already taken by `User`'s existing self-relation `@relation("UserCreatedBy")`; a second `creados` would be a compile error, and even `actualizados` alone would read ambiguously ("updated whats?"). (b) A single polymorphic "audit" relation — **rejected**: Prisma has no polymorphic relations; creator and updater are two distinct FKs.
**Rationale**: `clientes*` prefixes make the back-relations self-documenting and collision-free, and the relation *names* (`"ClienteCreadoPor"`, `"ClienteActualizadoPor"`) are globally unique across the schema, which Prisma requires to disambiguate the two `Cliente → User` links. This is the first cross-model audit FK in the codebase (unlike `User`'s single self-relation), so getting the naming unambiguous now sets the precedent for future audited entities.

### Decision: conditional identificación validation via a custom `ValidatorConstraint` (not chained `@ValidateIf`)
**Choice**: a `@Transform` that strips non-digits, plus a single custom `@IsIdentificacionValida()` decorator whose constraint reads the sibling `tipoIdentificacion` off `args.object` and applies `ID_TYPE_PATTERNS[tipo]` (DNI `^\d{7,8}$`, CUIT/CUIL `^\d{11}$`).
**Alternatives**: (a) two chained `@ValidateIf` branches (`@ValidateIf(o => o.tipo === 'dni') @Matches(/^\d{7,8}$/)` then `@ValidateIf(o => o.tipo === 'cuit'||'cuil') @Matches(/^\d{11}$/)`) — **rejected**: class-validator AND-combines *all* `@ValidateIf` conditions on the same property (validation runs only if every condition passes). For a DNI, the second condition (`tipo === 'cuit'||'cuil'`) is false, so it would disable *both* `@Matches` and let any DNI through unvalidated. This is a real trap, not a style preference. (b) a single permissive regex `^(\d{7,8}|\d{11})$` — **rejected**: it doesn't tie the length to the declared `tipo`, so a `dni` with 11 digits or a `cuit` with 7 would pass. (c) normalize + validate in the service — **rejected**: pushes input-shape rules out of the DTO layer where the rest of the module keeps them.
**Rationale**: the custom constraint reads the sibling field, so validation is deterministic and correctly tied to `tipo`, and `@Transform` normalizes once (dashes/dots/spaces stripped) so the *same* digits-only value is what gets length-checked **and** persisted — no drift between the validated value and the stored value, and no second normalization step in the service. Depth stays "light" per D2 (length/format only; no CUIT check-digit — explicitly out of scope).

### Decision: `create` stamps both `creadoPorId` and `actualizadoPorId`; `update` stamps only `actualizadoPorId`
**Choice**: on POST, `creadoPorId = actualizadoPorId = req.user.userId`; on PATCH, set `actualizadoPorId = req.user.userId` and never write `creadoPorId`.
**Alternatives**: leave `actualizadoPorId` null until the first edit — **rejected**: a freshly created row would show "no last editor", which is misleading; the creator *is* the last writer at creation time.
**Rationale**: "who created" is immutable history; "who last touched" always reflects the most recent writer. Resolving both server-side from the JWT (never from the request body) matches the existing `users.controller.ts` mechanism and makes the caller id non-suppliable.

### Decision: no self/master-lockout guard on `activo`
**Choice**: the cliente `activo` toggle is unconditional (a confirm dialog on deactivate is UX only).
**Alternatives**: port the `users.service.ts` `ForbiddenException` guards — **rejected**: those exist because deactivating/renaming a login account can lock a person (or the master) out of the system. Clientes don't authenticate and nothing else references them yet (D6), so there is nothing to lock out.
**Rationale**: keep the guard surface to exactly what a threat requires; adding login-specific guards to a non-login entity would be cargo-culting.

## Data Flow

    /clientes page ──listCustomers()──▶ GET /customers ──JwtAuthGuard──▶ CustomersService.findAll ──▶ Prisma (CUSTOMER_SELECT, nested creadoPor/actualizadoPor)
        │  submit (create)   ──createCustomer()──▶ POST /customers ──▶ service.create(dto, req.user.userId) ──▶ creadoPorId + actualizadoPorId = caller ──▶ refreshed list
        │  submit (edit)     ──updateCustomer()──▶ PATCH /customers/:id ──▶ service.update(id, dto, req.user.userId) ──▶ actualizadoPorId = caller (creadoPorId untouched)
        └  row toggle activo ──updateCustomer()──▶ PATCH /customers/:id ──▶ same update path, activo flipped

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `server/prisma/schema.prisma` | Modify | Add `Cliente` model + 2 audit FKs; add `clientesCreados`/`clientesActualizados` back-relations on `User` |
| `server/prisma/migrations/<timestamp>_add_cliente/` | Create | Additive migration (new table + 2 FK constraints) — generated by `prisma migrate dev` in apply phase |
| `server/src/customers/customers.controller.ts` | Create | Guarded controller, 4 routes, caller-id wiring |
| `server/src/customers/customers.service.ts` | Create | findAll/findOne/create/update + `CUSTOMER_SELECT` + TOCTOU backstop |
| `server/src/customers/customers.module.ts` | Create | Module wiring |
| `server/src/customers/customer.constants.ts` | Create | `ID_TYPES`, `ID_TYPE_PATTERNS`, `ID_TYPE_LABELS` |
| `server/src/customers/dto/identificacion.validator.ts` | Create | Custom `@IsIdentificacionValida()` constraint |
| `server/src/customers/dto/create-customer.dto.ts` | Create | `CreateCustomerDto` (with `@Transform` normalize) |
| `server/src/customers/dto/update-customer.dto.ts` | Create | `UpdateCustomerDto` |
| `server/src/app.module.ts` | Modify | Import + register `CustomersModule` |
| `client/app/lib/customers.ts` | Create | Typed fetch wrappers + `ID_TYPES`/labels |
| `client/app/(dashboard)/clientes/page.tsx` | Create | List page (search/filter/pagination/toggle/portal menu) |
| `client/app/(dashboard)/clientes/nuevo/page.tsx` | Create | Create form |
| `client/app/(dashboard)/clientes/editar/[id]/page.tsx` | Create | Edit form + unsaved-edit discard warning (dirty-state tracking, `showConfirm` guard on the Cancelar button for in-app navigation, native `beforeunload` guard for tab-close/refresh) |
| `client/app/lib/navigation.tsx` | Modify | Add top-level "Clientes" nav entry |
| `client/public/icons/clientes.svg` | Create (optional) | Nav icon; fall back to an existing icon if not provided |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Manual/e2e | 401 on all four routes without a Bearer token | Hit `GET/POST/PATCH /customers` with no `Authorization` header → expect 401 |
| Manual/e2e | 409 on duplicate `identificacion` (create) with TOCTOU + `P2002` backstop | POST the same identificación twice → second returns 409 |
| Manual/e2e | 409 on update to another cliente's identificación; self-value keeps (200) | PATCH row A's ID onto row B → 409; PATCH row A with its own ID → 200 |
| Manual/e2e | DNI validates at 7–8 digits; CUIT/CUIL at 11; dashes normalized before storage | POST `dni`="123" → 400; `cuit`="20-12345678-9" → 200 and stored as `20123456789`; `dni` with 11 digits → 400 |
| Manual/e2e | `creadoPorId` immutable after creation | Create as user X, PATCH as user Y → `creadoPor` still X, `actualizadoPor` now Y |
| Manual/e2e | `actualizadoPorId` updates on every PATCH | Two successive PATCHes by different users → `actualizadoPor` reflects the latest each time |
| Manual/e2e | List renders with in-memory search (razón social/identificación/teléfono), status filter, pagination, status toggle | Exercise the `/clientes` page against a reachable DB |
| Manual/e2e | Edit page warns before discarding unsaved edits (in-app + browser exit) | On `/clientes/editar/[id]`: edit a field then click Cancelar → `showConfirm` dialog appears; confirm → discards and routes to `/clientes`, cancel → stays with edits intact. With unsaved edits, refresh/close the tab → native `beforeunload` prompt appears. Editing a field back to its original value → no prompt (not dirty). After a successful save, the post-save redirect fires with no prompt. |
| Migration | Additive-only, reversible | Confirm `Cliente` table + 2 FKs created; rollback per Rollback Plan drops cleanly |

No automated test harness is assumed for this change (matching the `usuarios-crud` precedent); verification is manual/e2e against a reachable DB. If `sdd-init` reports a strict-TDD capability, `sdd-apply` should follow it instead.

## Migration / Rollout

Unlike `usuarios-crud` (no migration — all `User` columns pre-existed), this change **does** add a real Prisma migration. `sdd-apply` MUST, before running `npx prisma migrate dev --name add_cliente` in `server/`:
1. Confirm the reachable `DATABASE_URL` in `server/.env` points at the intended MySQL instance (the env target was unverified in prior phases and this is the first migration since usuarios).
2. Run the migration, then `prisma generate` (usually automatic) so the `Cliente` delegate and the new `User` back-relations are available to the service.

**Rollback** (additive-only, mechanical): revert the migration (drops `Cliente` + its 2 FKs — safe, nothing references it), remove `server/src/customers/` and its `app.module.ts` import, remove the two back-relation arrays from `User`, and remove the `client/app/(dashboard)/clientes/` routes, `lib/customers.ts`, and the nav entry.

## Open Questions / Assumptions

- [ ] `telefono` and `domicilio` are designed as **required** (non-null) to capture every listed field. If the product wants either optional, it's a one-line change per field: Prisma `String?` + DTO `@IsOptional()`. Flagged as an assumption, not a hard requirement.
- [ ] `/icons/clientes.svg` does not exist yet; apply phase adds it or reuses an existing icon to avoid a broken nav image.
- [ ] Confirm the correct MySQL instance is reachable before the apply-phase migration (`server/.env` unverified in prior phases).

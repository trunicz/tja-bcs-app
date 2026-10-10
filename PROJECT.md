# Project: TJA BCS Enterprise Judicial Platform Evolution

## Architecture
The system consists of a TypeScript Express backend and an Astro v7 SSR + React 19 frontend, persisting data in SQLite via Prisma ORM:
- **Backend Architecture (`backend/`)**:
  - Express server (`backend/src/index.ts`) on port 3001.
  - Prisma ORM managing SQLite (`backend/prisma/dev.db`).
  - Session/Bearer token management (`Session` model with token, usuarioId, isImpersonated, originalAdminId).
  - Auth & Authorization Middleware (`backend/src/middleware/auth.ts`) validating tokens and enforcing granular permissions per endpoint (`expedientes:view`, `expedientes:status`, `usuarios:view`, `roles:manage`, etc.).
  - Metric calculations (`GET /api/dashboard/metricas`) enhanced with executive KPIs (caseload by sala, pending resolutions, hearings in next 48h, urgent deadlines).
  - Status transition endpoint (`PUT /api/expedientes/:id/estatus`) with atomic audit logging in `MovimientoEstatus`.
  - User preference persistence (`/api/preferencias` / `/api/usuarios/preferencias`) saving theme, density, employee colors, and `ordenWidgets`.
- **Frontend Architecture (`frontend/`)**:
  - Astro v7 SSR (`output: 'server'`) with `@astrojs/node` standalone adapter and Tailwind CSS v4.
  - Astro View Transitions (`<ClientRouter />` from `astro:transitions`) with pre-swap preference preservation hook to eliminate dark mode white flashes.
  - React 19 Islands (`client:load`) for interactive UI components.
  - AppShell Architecture (`AppShell.tsx`):
    - AppHeader: interactive personal profile dropdown, notification drawer trigger, theme toggle (zero impersonation in header).
    - AppSidebar: hierarchical collapsible submenus ("Usuarios" and "Judicial / Procesal" accordion groups with auto-expansion).
    - Global Command Palette (`Ctrl + K`): fuzzy search across cases, user directory, navigation, settings.
    - Global Toast Container: event-driven alerts (`tja:toast`) replacing raw browser `alert()` popups.
    - Main Content: viewport unclipped with `flex-1 min-h-0 overflow-y-auto pb-16`.
- **Testing Architecture (`tests/`)**:
  - Tier 1: `test-auth.js` (50 assertions, auth & RBAC).
  - Tier 2: `tests/test-e2e-areas.mjs` (37 assertions, SSR routes & permissions).
  - Tier 3: `tests/test-preferences-persistence.mjs` (14 assertions, multi-user preferences).
  - Tier 4: `tests/test-browser-e2e.mjs` (19 assertions, CDP headless browser).
  - Tier 5: Adversarial Challenger suites (`challenger_m4_widgets_reordering.test.mjs`, `test-adversarial-m2-css-motion.mjs`, etc.).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Header Personal Profile Dropdown | Replace static avatar in `AppHeader.tsx` with interactive dropdown: user identity, role badge, employee color swatch, preferences link, theme toggle, logout. | M1 | Survey (Explorer 1) |
| 2 | Header Impersonation Removal | Remove `<ImpersonationSelector />` from `AppHeader.tsx` to reserve "Ver como" exclusively for the Users directory. | M1 | Survey (Explorer 1) |
| 3 | Hierarchical Sidebar Submenus | Accordion-style submenus in `AppSidebar.tsx` for "Usuarios" (/usuarios, /configuracion/roles) and "Judicial / Procesal" (Expedientes, Agenda, Analítica, Ayuda, Archivo, Mensajería) with active route preservation. | M1 | Survey (Explorer 1) |
| 4 | Global Command Palette (`Ctrl + K`) | Multi-entity fuzzy search in `CommandPalette.tsx` covering expedientes, user directory, system navigation, and operational settings shortcuts. | M1 | Survey (Explorer 1) |
| 5 | Dashboard Viewport Un-Clipping | Fix `100vh + 48px` overflow bug in `AppShell.tsx` & `Layout.astro` with `min-h-0` flex wrappers and `overflow-y-auto pb-16` on main content for 100% visible scrolling. | M1 | Survey (Explorer 1) |
| 6 | Users Area Impersonation Hub | Dedicated administrative banner in `/usuarios`, contextual badge on actively impersonated user row, operational 1-click revert flow. | M2 | Survey (Explorer 1) |
| 7 | Full Dark Mode Contrast Parity | Add Tailwind `dark:` classes across `UsuariosList`, `RoleConfiguration`, `HelpCenter`, `JudicialReports`, forms, and page titles (WCAG 2.1 AA compliance). | M2 | Survey (Explorer 1) |
| 8 | Kanban Board Drag-and-Drop | HTML5 drag-and-drop between the 4 Kanban columns with visual drop cues, optimistic UI update, and backend `/api/expedientes/:id/estatus` persistence with error rollback. | M3 | Survey (Explorer 2) |
| 9 | Dashboard Widgets Direct Manipulation | `GripVertical` drag handles on widget headers in `DashboardWidgets.tsx` to reposition widgets directly, saving `ordenWidgets` to SQLite via `/api/preferencias`, with 1-click "Restablecer Orden". | M3 | Survey (Explorer 2) |
| 10 | Astro View Transitions | Integrate `<ClientRouter />` in `Layout.astro` with `astro:before-swap` preference copying hook to eliminate dark mode white flashes during SPA navigation. | M4 | Survey (Explorer 2) |
| 11 | Subtle Entrance Animations & Kill-Switch | Explicit `@keyframes` (`fadeIn`, `scaleIn`, `slideInDown`, `slideInUp`) in `global.css` for modals, dropdowns, cards, toasts; complete suppression (`0.001ms`) under animation kill-switch. | M4 | Survey (Explorer 2) |
| 12 | Global Toast Alert System | Decoupled event-driven toast utility (`toast.ts`) and floating `<ToastContainer />` in `AppShell.tsx`, replacing all 17 raw `alert()` calls across components with styled toasts. | M4 | Survey (Explorer 3) |
| 13 | Interactive Notification Drawer | Slide-over drawer in header action cluster for quick review and management of system notifications. | M4 | Survey (Explorer 3) |
| 14 | Minimalist Executive Dashboard | High-density summary cards (caseload by sala, pending resolutions, hearings in next 48h, urgent deadlines) with backend `GET /api/dashboard/metricas` calculation extension and settings toggle. | M5 | Survey (Explorer 3) |
| 15 | Advanced Judicial Analytics | Recharts graphical breakdowns (`BarChart`, `PieChart`, `AreaChart`) in `/reportes` with procedural performance KPIs and full dark mode styling. | M5 | Survey (Explorer 3) |
| 16 | Comprehensive Help Center | Procedural tribunal workflow guides, exhaustive keyboard shortcuts catalog, multi-entity fuzzy search, and elimination of dead buttons in `/ayuda`. | M5 | Survey (Explorer 3) |
| 17 | Full E2E Acceptance & Zero Regression | 100% pass rate across Tier 1 (`test-auth.js`), Tier 2 (`test-e2e-areas.mjs`), Tier 3 (`test-preferences-persistence.mjs`), Tier 4 (`test-browser-e2e.mjs`), and new acceptance test suites. | M6 | Survey (Explorer 3) |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Shell, Navigation & Layout Architecture | Profile dropdown in header, remove impersonation from header, hierarchical accordion sidebar, global Command Palette (Ctrl+K), dashboard viewport un-clipping | none | DONE |
| M2 | Users Impersonation Hub & Dark Mode Parity | Impersonation hub banner & badges in `/usuarios`, full dark mode WCAG 2.1 AA token parity across all tables, forms, and cards | M1 | DONE |
| M3 | Direct Manipulation: Kanban & Dashboard DnD | HTML5 drag-and-drop on Kanban cards with `/api/expedientes/:id/estatus` persistence; dashboard widget drag handles with `ordenWidgets` persistence & reset button | M1 | PLANNED |
| M4 | View Transitions, Motion & Global Toast Alerts | Astro `<ClientRouter />` with `astro:before-swap` zero-flash hook, `@keyframes` motion polish, global toast event bus & container replacing all `alert()`, notification drawer | M1, M2 | PLANNED |
| M5 | Executive Dashboard, Analytics & Help Center | High-density executive summary cards, Recharts graphical analytics in `/reportes`, tribunal workflow guides and comprehensive search in `/ayuda` | M1, M2, M4 | PLANNED |
| M6 | Full Regression & Acceptance Verification | Execute full test suite (Tiers 1-5), verify 0 console errors, clean builds, forensic audit, and victory report to Sentinel | M1, M2, M3, M4, M5 | PLANNED |

---

## Interface Contracts

### 1. Global Toast Event Contract
- **Trigger**: `window.dispatchEvent(new CustomEvent('tja:toast', { detail: { type, title, message, duration } }))`
- **Helper**: `toast.success(message, title?)`, `toast.error(message, title?)`, `toast.warning(message, title?)`, `toast.info(message, title?)`
- **Types**: `type ToastType = 'success' | 'warning' | 'error' | 'info'`
- **Receiver**: `<ToastContainer />` mounted in `AppShell.tsx`

### 2. Kanban Status Persistence Contract
- **Endpoint**: `PUT /api/expedientes/:id/estatus`
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`
- **Payload**:
  ```json
  {
    "nuevoEstatusId": number,
    "nuevoSubEstatusId": number,
    "notas": string
  }
  ```
- **Response (200)**: `{ "id": number, "folio": string, "estatusId": number, "subEstatusId": number, ... }`
- **Error (403/500)**: `{ "error": string }` -> Triggers optimistic rollback & error toast

### 3. Dashboard Widget Reorder & Reset Contract
- **Storage**: `PreferenciaUsuario.ordenWidgets`
- **API Endpoint**: `PUT /api/usuarios/preferencias` (or `/api/preferencias`)
- **Payload**: `{ "ordenWidgets": string[] }` (subset/permutation of `['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes']`)
- **Reset**: Resets to `DEFAULT_PREFERENCES.ordenWidgets` (`['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes']`)
- **DOM Event**: `window.dispatchEvent(new CustomEvent('tja:widget-order-changed', { detail: { ordenWidgets } }))`

### 4. Astro View Transitions Hook Contract
- **Lifecycle Event**: `document.addEventListener('astro:before-swap', (event) => { restorePreferences(event.newDocument); })`
- **Preserved Attributes**: `data-theme`, `.dark` class, `data-accent`, `data-density`, `data-font-size`, `data-animations`, `data-sidebar`, `data-sidebar-pos`
- **Island Persistence**: `<AppShell client:load transition:persist="app-shell" ...>`

### 5. Executive Dashboard Metrics Contract
- **Endpoint**: `GET /api/dashboard/metricas`
- **Response**:
  ```json
  {
    "totalExpedientes": number,
    "expedientesPorSala": Array<{ "sala": string, "cantidad": number }>,
    "expedientesPorEstatus": Array<{ "estatus": string, "cantidad": number }>,
    "resumenEjecutivo": {
      "cargaPorSala": Array<{ "salaId": number, "sala": string, "activos": number, "porcentaje": number }>,
      "resolucionesPendientes": number,
      "audienciasProximas48h": number,
      "terminosUrgentes": number
    }
  }
  ```

---

## Code Layout
- **Frontend Components & Shell**:
  - `frontend/src/layouts/Layout.astro` — Main layout with `<ClientRouter />`, zero-FOUC script, and view transition swap handler.
  - `frontend/src/components/shell/AppShell.tsx` — Root application shell, unclipped scroll container, global modals, toasts & drawers.
  - `frontend/src/components/shell/AppHeader.tsx` — Top header with interactive user profile menu, notification bell, theme toggle.
  - `frontend/src/components/shell/AppSidebar.tsx` — Hierarchical sidebar with collapsible accordion submenus.
  - `frontend/src/components/shell/CommandPalette.tsx` — Global Ctrl+K omnibar with fuzzy search.
  - `frontend/src/lib/toast.ts` & `frontend/src/components/common/ToastContainer.tsx` — Global toast notification system.
  - `frontend/src/components/notifications/NotificationDrawer.tsx` — Header notification drawer.
- **Expedientes & Kanban**:
  - `frontend/src/components/expedientes/ExpedientesKanban.tsx` — Native HTML5 drag-and-drop kanban board.
  - `frontend/src/components/expedientes/ExpedientesViewContainer.tsx` — View switcher (Table, Kanban, Calendar).
- **Dashboard & Analytics**:
  - `frontend/src/components/dashboard/DashboardWidgets.tsx` — Drag-and-drop widget reordering and reset.
  - `frontend/src/components/dashboard/ExecutiveSummaryCards.tsx` — High-density executive KPI summary strip.
  - `frontend/src/components/reportes/JudicialReports.tsx` — Recharts graphical judicial analytics.
  - `frontend/src/components/ayuda/HelpCenter.tsx` — Judicial workflow guides, shortcuts, multi-category search.
- **Backend**:
  - `backend/src/index.ts` — Server entry point, status transition routes, executive metric calculations.
  - `backend/src/routes/preferencias.ts` — Preferences persistence (theme, density, widgets).
- **Tests**:
  - `test-auth.js` — Tier 1 auth/RBAC.
  - `tests/test-e2e-areas.mjs` — Tier 2 SSR routes.
  - `tests/test-preferences-persistence.mjs` — Tier 3 preferences.
  - `tests/test-browser-e2e.mjs` — Tier 4 CDP browser suite.
  - `tests/challenger_*.test.mjs` — Tier 5 adversarial tests.

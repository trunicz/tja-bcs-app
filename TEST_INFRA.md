# Test Infrastructure & Multi-Tier Verification Plan

**Project:** TJA BCS Case Management System — Evolution (UI/UX, Customization & Multi-Area Shell)  
**Runtime:** Node.js `v23.7.0` | SQLite + Prisma ORM | Express Backend (Port 3001) | Astro SSR Frontend (Port 4321)  
**Author:** Lead E2E Test Writer (`test_writer_evo_o4`)  
**Status:** ACTIVE  
**Last Updated:** 2026-10-09  

---

## 1. Test Architecture & Principles

### 1.1 Four-Tier Testing Hierarchy
The verification framework enforces progressive, end-to-end quality assurance organized into four discrete tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Tier 4: Browser E2E Verification (tests/test-browser-e2e.mjs)         │
│  Headless Chrome CDP · Zero Console Errors · Multi-View · Motion Off   │
├────────────────────────────────────────────────────────────────────────┤
│  Tier 3: Preferences & Isolation (tests/test-preferences-persistence)  │
│  Per-User Customization · Multi-User Isolation · Session Persistence   │
├────────────────────────────────────────────────────────────────────────┤
│  Tier 2: Multi-Area Shell & Access (tests/test-e2e-areas.mjs)          │
│  SSR Status Codes · Placeholder Badges · Role Enforcement (Admin/User) │
├────────────────────────────────────────────────────────────────────────┤
│  Tier 1: Auth & RBAC Regression Suite (test-auth.js)                   │
│  Session Tokens · 403 Granular RBAC · "View As" Impersonation & Revert │
└────────────────────────────────────────────────────────────────────────┘
```

- **Tier 1 — Auth & RBAC Regression (`test-auth.js`):** Validates authentication, session lifecycle, granular 13-permission RBAC enforcement, and administrative impersonation flows ("View As" / revert).
- **Tier 2 — Multi-Area Shell & Access Control (`tests/test-e2e-areas.mjs`):** Programmatically hits every R1 route in the application shell as Admin and Restricted Consulta roles, validating HTTP 200 responses, placeholder indicators ("Próximamente" / "Coming Soon"), and route access barriers.
- **Tier 3 — Preferences Customization & Multi-User Isolation (`tests/test-preferences-persistence.mjs`):** Tests the appearance preference engine via `/api/usuarios/preferencias`, validating theme, accent, density, font scaling, sidebar layout, animation kill-switch, multi-user isolation (zero state leak between User A and User B), and cross-session persistence across token invalidations.
- **Tier 4 — Browser E2E & Motion Suppression (`tests/test-browser-e2e.mjs`):** Scripted headless browser automation using native Chrome DevTools Protocol (CDP) over WebSocket, checking zero console exceptions across routes, interactive view switching on `/expedientes` (Table, Kanban, Calendar), and strict 0s duration suppression when animations are toggled off or OS prefers-reduced-motion is active.

### 1.2 Zero-Dependency Native Runner
To prevent Windows PowerShell script-execution policy errors (`.ps1` blocking) and package-manager friction:
- All test suites execute natively using Node.js `v23.7.0` built-in ES modules (`.mjs`).
- HTTP requests utilize global `fetch` with automatic cookie and Bearer token handling.
- Headless browser verification utilizes the native `WebSocket` API communicating directly with Chrome/Edge via the Chrome DevTools Protocol (CDP) on `--remote-debugging-port`. No external heavy frameworks (Jest, Mocha, Vitest, Cypress) are needed.

### 1.3 Target Topology & Pre-Flight Probing
| Component | Default Address | Protocol | Primary Scope Under Test |
|---|---|---|---|
| **Backend API** | `http://localhost:3001` | HTTP / JSON | Auth, RBAC, Preferences API, Scaffolding endpoints (`/api/audiencias`, `/api/notificaciones`, `/api/reportes/estadisticas`) |
| **Frontend SSR** | `http://localhost:4321` | HTTP / HTML | Multi-Area Shell, SSR Middleware guards, Coming-Soon placeholders, Hydrated React Islands |
| **Headless Browser** | `http://127.0.0.1:9222` | CDP / WebSocket | Page load telemetry, DOM mutations, view switcher state, computed CSS animation durations |

Every test suite includes intelligent pre-flight probing: if a target service is offline, the suite prints clean, actionable start-up instructions and diagnostic guidance rather than unhandled stack traces.

---

## 2. Test Execution Commands & Run Guide

All commands run directly from the project root in Windows PowerShell:

### 2.1 Individual Tier Execution

#### Tier 1: Core Auth & RBAC Regression
```powershell
node test-auth.js
```

#### Tier 2: Multi-Area Shell & Route Access Control
```powershell
node tests/test-e2e-areas.mjs
```

#### Tier 3: Appearance Preferences & Multi-User Isolation Persistence
```powershell
node tests/test-preferences-persistence.mjs
```

#### Tier 4: Headless Browser E2E (Zero Console Errors, Multi-Views, Motion Kill-Switch)
```powershell
node tests/test-browser-e2e.mjs
```

### 2.2 Comprehensive Suite Execution (All Tiers)
To run all verification suites in sequence:
```powershell
node test-auth.js; node tests/test-e2e-areas.mjs; node tests/test-preferences-persistence.mjs; node tests/test-browser-e2e.mjs
```

### 2.3 Starting Application Services (Prerequisites)
When executing against live servers:
1. **Backend Server (Port 3001):**
   ```powershell
   cmd /c "cd backend && npm run dev"
   ```
2. **Frontend SSR Server (Port 4321):**
   ```powershell
   cmd /c "cd frontend && npm run dev"
   ```

---

## 3. Feature Inventory Coverage Matrix

Mapping of all 14 features from `PROJECT.md` to specific verification tiers, test suites, and assertions:

| # | Feature Name | Milestone | Verification Tier & Suite | Scope & Key Assertions |
|---|---|---|---|---|
| **F1** | DB Schema Evolution for Preferences & Scaffolding | M1 | Tier 3: `test-preferences-persistence.mjs` | Verifies Prisma schema persistence for `PreferenciaUsuario`, `colorEmpleado`, `Audiencia`, and `Notificacion` models. |
| **F2** | Backend User Preferences API | M1 | Tier 3: `test-preferences-persistence.mjs` | Validates `GET` and `PUT` `/api/usuarios/preferencias` and `/api/auth/preferencias` with granular validation of partial updates. |
| **F3** | Backend Scaffolding APIs | M1 | Tier 2 & Tier 3: `test-e2e-areas.mjs`, `test-preferences-persistence.mjs` | Validates responses for `/api/audiencias`, `/api/notificaciones`, `/api/reportes/estadisticas`, and filtered `/api/expedientes`. |
| **F4** | CSS Design Tokens & Motion Kill-Switch | M2, M5 | Tier 4: `test-browser-e2e.mjs` | Inspects CSS custom properties (`--color-accent`, density tokens) and verifies `@media (prefers-reduced-motion)` & `[data-animations="disabled"]` CSS rules. |
| **F5** | Multi-Area AppShell & Responsive Navigation | M2 | Tier 2: `test-e2e-areas.mjs` | Confirms `<AppShell>` elements, navigation links, and header components are present across rendered pages. |
| **F6** | Navigation Routes & Coming-Soon Placeholders | M2 | Tier 2: `test-e2e-areas.mjs` | Hits all R1 routes; verifies placeholder badges ("Próximamente" / "Coming Soon") on `/documentos` and `/mensajeria`. |
| **F7** | Per-User Appearance Engine & Live Preview | M3 | Tier 3: `test-preferences-persistence.mjs` | Validates real-time persistence of theme (`light`/`dark`/`auto`), palettes, density, font scaling, and sidebar layout. |
| **F8** | Employee Identifying Color System | M3 | Tier 3: `test-preferences-persistence.mjs` | Validates persistence and multi-user isolation of `colorEmpleado` across different user profiles. |
| **F9** | Expedientes Switchable Views (Table, Kanban, Calendar) | M4 | Tier 4: `test-browser-e2e.mjs` | Programmatically triggers view switches on `/expedientes` and verifies DOM rendering of Table, 4 Kanban columns, and Calendar. |
| **F10** | Interactive Dashboard Widgets | M4 | Tier 2 & Tier 4: `test-e2e-areas.mjs`, `test-browser-e2e.mjs` | Verifies widget rendering on `/`, widget metric indicators, and reorderable layout attributes. |
| **F11** | Motion & Polish Transitions & Skeletons | M5 | Tier 4: `test-browser-e2e.mjs` | Validates absence of console exceptions during page transitions and verifies loading skeletons. |
| **F12** | Strict Reduced Motion & Animation Kill-Switch | M5 | Tier 4: `test-browser-e2e.mjs` | Measures computed transition/animation durations when animations are disabled; asserts duration `= 0s` or `<= 0.001s`. |
| **F13** | Multi-Tier Acceptance Test Suites | Testing Track | Tiers 1–4 (`test-auth.js`, `test-e2e-areas`, `test-preferences-persistence`, `test-browser-e2e`) | Complete automated test pipeline with clean exit codes and actionable diagnostic logs. |
| **F14** | Final Acceptance & Adversarial Hardening | M6 | Tier 5 & All Suites | End-to-end regression validation, cross-tenant isolation, tamper resistance, and zero-defect quality gate. |

---

## 4. Test Oracles & Expected Output Derivation

### 4.1 Authoritative Sources
All assertion criteria are derived from explicit requirements in:
1. `ORIGINAL_REQUEST.md § Follow-up (2026-10-09T17:01:42Z)`:
   - R1: Multi-area application shell and coming-soon placeholders.
   - R2: Per-user appearance customization, live preview, multi-user isolation, employee identifying color.
   - R3: Motion, polish, and animation kill-switch (0s duration when disabled or reduced-motion requested).
2. `PROJECT.md § Interface Contracts`:
   - Exact JSON schemas for `/api/usuarios/preferencias` and `/api/auth/preferencias`.
   - Granular permission codes (`expedientes:view`, `roles:manage`, etc.).
   - Route path hierarchy and placeholder badge text.

### 4.2 Seed Account Fixtures & Roles
| Email | Password | Role | Expected Privileges & Test Role |
|---|---|---|---|
| `admin@tjabcs.gob.mx` | `password123` | Administrador | Global Admin: access to all areas including `/configuracion/roles`, ability to manage preferences and view as. |
| `consulta@tjabcs.gob.mx` | `password123` | Consulta/Dirección | Restricted Role: read access to standard areas; strictly denied `403 Forbidden` on `/configuracion/roles`. |

### 4.3 Deterministic Assertions & Variance Handling
- **Status Codes:** Strict HTTP status code assertions (`200 OK`, `302 Redirect`, `401 Unauthorized`, `403 Forbidden`).
- **Placeholder Detection:** Case-insensitive regular expression matching `/(próximamente|coming soon)/i` on `/documentos` and `/mensajeria`.
- **Preference Isolation:** Comparing distinct property graphs between User A and User B:
  - User A: `{ tema: "dark", colorAcento: "#10b981", densidad: "compact", tamanoFuente: "large", colorEmpleado: "#ef4444" }`
  - User B: `{ tema: "light", colorAcento: "#6366f1", densidad: "comfortable", tamanoFuente: "small", colorEmpleado: "#3b82f6" }`
  - Asserting `userA.tema !== userB.tema`, `userA.colorEmpleado !== userB.colorEmpleado`, and fresh login preserves exact values.
- **Computed CSS Durations:** Evaluating DOM computed styles:
  ```javascript
  const transitionDuration = parseFloat(getComputedStyle(el).transitionDuration);
  assert(transitionDuration === 0 || transitionDuration <= 0.001);
  ```

---

## 5. QA Protocols & Defect Escalation

1. **Test Writer Boundaries:** The test writer modifies **test code only**. Implementation bugs in backend routes, Astro SSR pages, or React islands are cataloged with reproduction payloads and escalated immediately to the orchestrator.
2. **Standard Exit Codes:**
   - `0`: All assertions passed.
   - `1`: One or more assertions failed (with full diagnostic diff in stderr/stdout).
3. **Idempotence & Cleanup:** Tests restore any modified preferences or session state during teardown to avoid contaminating subsequent test runs.

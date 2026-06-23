# BrowserOS — Project Progress

## Current Phase
**Phase 3: Feature-complete MVP — All core systems implemented**

---

## Completed Work

### Phase 0 — Architecture & Design ✅
- System architecture diagram
- Prisma schema design (Users, Sessions, VFS, Desktop, Windows, Audit)
- Folder structure definition
- State management design (Zustand slices)
- Realtime architecture (Socket.IO + Redis Pub/Sub)
- Security model (RBAC, CSRF, Argon2id, rate limiting, audit logs)
- API specification

### Phase 1 — Foundation ✅
- Git repository initialized
- .gitignore, README.md, PROJECT_PROGRESS.md
- Docker Compose (Postgres 16 + Redis 7)
- Next.js 15 (App Router) + TypeScript + TailwindCSS
- Prisma schema with full data model
- Environment configuration (.env.example)

### Phase 2 — Authentication ✅
- `POST /api/auth/signup` — Argon2id hashing, user creation, home dir bootstrap
- `POST /api/auth/login` — Timing-safe verification, session creation
- `POST /api/auth/logout` — Redis + DB session cleanup
- `GET /api/auth/me` — Session validation
- `POST /api/auth/reset-password` — Token-based password reset
- `GET/DELETE /api/auth/sessions` — Multi-device session management
- HTTP-only secure cookies
- Redis sliding-window rate limiting on auth endpoints
- Audit logging on all auth events
- Login page, Signup page, Reset password page (all with Suspense)

### Phase 3 — Desktop Shell ✅
- Desktop component with wallpaper classes
- 4 wallpaper themes (Midnight, Aurora, Sunset, Ocean)
- Desktop icons with drag-and-drop positioning
- Right-click context menu (open apps, change wallpaper)
- Desktop layout persistence (server-synced, debounced)
- Global keyboard shortcuts (Ctrl+E, Ctrl+T, Ctrl+,)

### Phase 4 — Window Manager ✅
- `WindowManager` — renders all open windows
- `WindowFrame` — full drag, resize (8 handles), minimize, maximize, restore
- macOS-style traffic light buttons
- Z-index management (focus brings to front)
- Double-click titlebar to maximize/restore
- Window state persistence (server-synced, 2s debounce)
- Multiple instances support

### Phase 5 — Virtual File System ✅
- `POST /api/fs` — Create file/directory
- `GET /api/fs?parentId=` — List directory
- `GET /api/fs?q=` — Search files
- `GET /api/fs/:nodeId` — Read node
- `PATCH /api/fs/:nodeId` — Update content / rename
- `DELETE /api/fs/:nodeId` — Soft delete
- `POST /api/fs/:nodeId/move` — Move node
- `POST /api/fs/:nodeId/copy` — Copy node
- `GET/POST/DELETE /api/fs/:nodeId/permissions` — RBAC management
- Self-referential tree in PostgreSQL
- Soft delete with `deletedAt` timestamp
- Home directory bootstrap on signup
- Audit logging on all FS operations

### Phase 6 — Applications ✅
- **File Explorer** — Grid/list view, breadcrumb navigation, create/rename/delete, context menu
- **Terminal** — Full VFS-backed shell: pwd, ls, cd, mkdir, touch, rm, cat, mv, cp, clear, history
- **Text Editor** — Line numbers, auto-save (1.5s debounce), Ctrl+S, Save As, dirty indicator
- **Notes** — Sidebar note list, rich text editing, auto-title from content
- **Calculator** — Full arithmetic with operator chaining and history
- **Settings** — Wallpaper picker, taskbar pin/unpin, account info, about section
- Plugin architecture via `AppRegistry` — apps are dynamically registerable

### Phase 7 — Realtime ✅
- Socket.IO server with Redis adapter for horizontal scaling
- Cookie-based socket authentication
- Personal rooms: `desktop:{userId}`, `fs:{userId}`, `notify:{userId}`
- Desktop events: wallpaper change, layout update → synced across tabs/devices
- FS events: node created/updated/deleted/moved → synced in real-time
- `useSocket` hook — auto-connects on authentication, handles all events
- `useWindowPersistence` — debounced window state sync
- `useDesktopLayoutPersistence` — debounced layout sync

### Phase 8 — Search ✅
- `GET /api/search` — Unified search endpoint (files)
- `GlobalSearch` overlay — Ctrl/Cmd+Space to open
- Instant app search (local registry)
- Async file search with debounce (150ms)
- Keyboard navigation (↑↓ to navigate, Enter to open, Esc to close)

### Phase 9 — Security ✅
- Argon2id password hashing (65536 MB, 3 iterations, 4 parallelism)
- HTTP-only, SameSite=lax, Secure cookies
- Redis sliding-window rate limiting on auth endpoints
- Zod validation on all API inputs
- RBAC on all VFS operations (OWNER/EDITOR/VIEWER)
- CSRF token infrastructure (generateCsrfToken/validateCsrfToken)
- Audit log on all auth, FS, desktop events
- `server-only` markers on all server modules
- CSP + security headers in next.config.ts
- Timing-safe login (constant-time even for missing users)
- `GET/DELETE /api/admin/audit` — Admin-only audit log access

---

## Next Tasks

- [ ] Email service integration (for password reset emails)
- [ ] File upload support (binary files, images)
- [ ] Drag-and-drop between File Explorer and desktop
- [ ] Socket.IO custom server setup (for production)
- [ ] E2E tests (Playwright)
- [ ] Unit tests for VFS logic and auth
- [ ] Docker production image
- [ ] CI/CD pipeline

---

## Known Issues

- Docker Desktop has an I/O error on this machine — restart Docker Desktop to fix
- argon2 native bindings require `npm install --ignore-scripts=false` in a clean environment
- Socket.IO requires a custom Next.js server in production (currently configured for dev)

---

## Architectural Decisions

### ADR-001: Session-based Auth over JWT
**Decision:** Redis-backed server sessions with HTTP-only cookies.
**Rationale:** SaaS products need reliable session revocation. JWTs can't be invalidated without a blocklist.

### ADR-002: VFS as PostgreSQL rows
**Decision:** Virtual filesystem as `fs_nodes` table with self-referential `parent_id`.
**Rationale:** Complex queries, transactional consistency, row-level RBAC.

### ADR-003: Plugin Architecture for Applications
**Decision:** `AppRegistry` singleton — apps register themselves at startup.
**Rationale:** New apps without modifying core. Each app is self-contained with metadata.

### ADR-004: Zustand with Immer middleware
**Decision:** Zustand slices with Immer for immutable state updates.
**Rationale:** Lower boilerplate than Redux, simple mental model, easy to test.

### ADR-005: Socket.IO + Redis adapter
**Decision:** Socket.IO over raw WebSockets, with Redis Pub/Sub for horizontal scaling.
**Rationale:** Built-in reconnection, room management, scales across multiple server instances.

### ADR-006: server-only module isolation
**Decision:** Mark all server modules with `import 'server-only'` and isolate constants.
**Rationale:** Prevents native Node.js modules (ioredis, argon2) from being bundled client-side.

---

## Commit History

- `chore: initial project setup` — Foundation, Docker, schema, env
- `feat: complete MVP implementation` — All phases 1–9

## Route Map

| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/auth/signup | Register |
| POST | /api/auth/login | Login |
| POST | /api/auth/logout | Logout |
| GET | /api/auth/me | Current user |
| POST | /api/auth/reset-password | Request/complete reset |
| GET/DELETE | /api/auth/sessions | Session management |
| GET/PUT | /api/desktop/layout | Desktop layout |
| GET/PUT/DELETE | /api/desktop/windows | Window states |
| GET/POST | /api/fs | List/create nodes |
| GET/PATCH/DELETE | /api/fs/[nodeId] | Node operations |
| POST | /api/fs/[nodeId]/move | Move node |
| POST | /api/fs/[nodeId]/copy | Copy node |
| GET/POST/DELETE | /api/fs/[nodeId]/permissions | RBAC |
| GET | /api/search | Unified search |
| GET | /api/admin/audit | Audit logs (admin) |

# BrowserOS

A production-grade browser operating system built with Next.js 15, TypeScript, PostgreSQL, Redis, and Socket.IO. Designed to resemble ChromeOS/macOS and built to support thousands of concurrent users as a real SaaS product.

## Features

- **Authentication** — Secure session-based auth with Argon2id hashing, HTTP-only cookies, CSRF protection, and password reset
- **Desktop Environment** — Wallpaper themes, desktop icons, right-click context menus, drag-and-drop positioning, and persistent layout
- **Window Manager** — Resizable, draggable, multi-instance windows with z-index stacking and macOS-style traffic light controls
- **Virtual File System** — Nested directories, search, move/copy/delete/rename, RBAC permissions, and soft delete
- **Built-in Applications** — File Explorer, Terminal, Text Editor, Notes, Calculator, Settings
- **Plugin Architecture** — Applications are dynamically registerable via a self-contained app registry
- **Global Search** — Ctrl+Space overlay with instant app search and async file search with keyboard navigation
- **Realtime Sync** — Multi-device desktop and file sync via Socket.IO + Redis Pub/Sub

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | TailwindCSS |
| Database | PostgreSQL via Prisma |
| Cache / Sessions | Redis |
| State Management | Zustand |
| Realtime | Socket.IO |
| Infrastructure | Docker Compose |
| Auth | Argon2id + HTTP-only cookies |

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm (comes with Node.js)

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd browseros

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Fill in your values

# Start infrastructure (Postgres + Redis)
docker compose up -d

# Run database migrations
npm run prisma:migrate

# Seed initial data (creates a demo user)
npm run prisma:seed

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

The project follows a layered architecture with strict server/client separation:

- **Auth layer** — Argon2id hashing, Redis-backed sessions, sliding-window rate limiting, timing-safe login
- **VFS layer** — PostgreSQL `fs_nodes` table with self-referential `parent_id` for a full tree structure
- **RBAC layer** — Per-node `OWNER / EDITOR / VIEWER` roles with audit logging on every mutation
- **Realtime layer** — Socket.IO rooms (`desktop:{userId}`, `fs:{userId}`) with Redis Pub/Sub for horizontal scaling
- **App layer** — Plugin registry pattern; each app is self-contained with metadata and a default window size

Key architectural decisions:
- **Sessions over JWTs** — Redis-backed sessions allow instant revocation without a blocklist
- **VFS as DB rows** — Complex queries, transactional consistency, and row-level RBAC without a separate storage service
- **`server-only` isolation** — All server modules are marked to prevent native Node.js bindings from being bundled client-side

## Development

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check
npm run prisma:studio  # Open Prisma Studio (DB GUI)
```

## Project Structure

```
browseros/
├── app/               # Next.js App Router (pages + API routes)
│   ├── (auth)/        # Login, signup, reset password pages
│   ├── (desktop)/     # Desktop shell page
│   └── api/           # REST API routes
├── components/        # React components
│   ├── apps/          # Built-in applications (Explorer, Terminal, etc.)
│   ├── desktop/       # Desktop shell, icons, context menu
│   ├── taskbar/       # Taskbar, clock, system tray
│   ├── window/        # WindowFrame and WindowManager
│   ├── search/        # Global search overlay
│   └── ui/            # Shared UI primitives (Toast, etc.)
├── lib/               # Server-side logic (auth, db, redis, vfs, rbac)
├── store/             # Zustand state slices
├── hooks/             # Custom React hooks
├── types/             # Shared TypeScript types
├── registry/          # Application plugin registry
└── prisma/            # Prisma schema, migrations, and seed
```

## License

MIT

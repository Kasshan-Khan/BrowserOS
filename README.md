# BrowserOS

A production-grade browser operating system built with Next.js 15, TypeScript, PostgreSQL, Redis, and Socket.IO. Designed to resemble ChromeOS/macOS and built to support thousands of concurrent users as a real SaaS product.

## Features

- **Authentication** — Secure session-based auth with Argon2id hashing, HTTP-only cookies, password reset
- **Desktop Environment** — Wallpapers, icons, context menus, drag-and-drop, persistent layout
- **Window Manager** — Resizable, draggable, multi-instance windows with z-index management
- **Virtual File System** — Nested directories, search, move/copy/delete/rename, RBAC permissions, soft delete
- **Built-in Applications** — File Explorer, Terminal, Text Editor, Notes, Calculator, Settings
- **Plugin Architecture** — Applications are dynamically registerable via a plugin registry
- **Global Search** — Real-time search across apps, files, and settings via Socket.IO
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
- pnpm (recommended)

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd browseros

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Fill in your values

# Start infrastructure (Postgres + Redis)
docker compose up -d

# Run database migrations
pnpm prisma migrate dev

# Seed initial data
pnpm prisma db seed

# Start the development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

See [docs/architecture.md](docs/architecture.md) for full system design, tradeoffs, and ADRs.

## Development

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
pnpm test         # Run tests
```

## Project Structure

```
src/
├── app/           # Next.js App Router (pages + API routes)
├── components/    # React components (desktop, windows, apps, ui)
├── lib/           # Server-side logic (auth, db, redis, vfs, rbac)
├── store/         # Zustand state slices
├── hooks/         # Custom React hooks
├── types/         # Shared TypeScript types
└── registry/      # Application plugin registry
```

## License

MIT

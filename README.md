# BrowserOS

A production-grade, web-based operating system built with Next.js 15, TypeScript, PostgreSQL, Redis, and Socket.IO. Designed to resemble ChromeOS/macOS and built to support thousands of concurrent users with real-time syncing, peer-to-peer WebRTC communications, and real-time collaboration.

## 🚀 Features

- **Authentication & Security** — Secure session-based auth with Argon2id hashing, HTTP-only cookies, CSRF protection, and sliding-window rate limiting.
- **Desktop Environment** — Wallpaper themes, desktop icons, right-click context menus, drag-and-drop positioning, and persistent layout synced across devices.
- **Window Manager** — Resizable, draggable, multi-instance windows with z-index stacking and macOS-style traffic light controls.
- **Virtual File System** — Nested directories, search, move/copy/delete/rename, RBAC permissions (Owner/Editor/Viewer), and soft deletes.
- **Built-in Applications** — File Explorer, Terminal, Text Editor, Notes, Calculator, Settings.
- **Messaging & Socials** — Real-time messaging, group chats, friends lists, typing indicators, and online/offline presence status.
- **Video & Voice Calls (WebRTC)** — Peer-to-peer encrypted video, voice, and screen-sharing using custom WebRTC signaling.
- **Collab Editor** — Real-time collaborative text editing with instant updates across multiple users.
- **Plugin Architecture** — Applications are dynamically registerable via a self-contained app registry.
- **Global Search** — `Ctrl+Space` (or `Cmd+Space`) overlay with instant app search and async file search.
- **Realtime Sync** — Multi-device desktop, file, and message syncing via Socket.IO + Redis Pub/Sub.

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | TailwindCSS v4 |
| Database | PostgreSQL (via Prisma) |
| Cache / Sessions / PubSub | Redis (ioredis) |
| State Management | Zustand + Immer |
| Realtime / WebRTC Signaling | Socket.IO |
| Infrastructure | Docker Compose (Local) / Render (Cloud) |
| Auth | Custom Argon2id + HTTP-only cookies |

---

## 💻 Developer Self-Install (Local Development)

To run the full BrowserOS environment on your local machine using Docker for the database and cache.

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- npm (comes with Node.js)

### Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd browseros

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env
# Open .env and customize any secrets if desired

# 4. Start infrastructure (Postgres + Redis)
docker compose up -d

# 5. Run database migrations (sets up schema)
npx prisma migrate dev

# 6. Seed initial data (creates a demo user and initial filesystem)
npm run prisma:seed

# 7. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The default seeded user is `demo@browseros.local` with password `password123` (if seeded).

---

## ☁️ Production Deployment Guide (Render.com)

BrowserOS is designed to be easily deployed to serverful hosting platforms like Render or Railway. *(Note: Serverless platforms like Vercel or Netlify are **not** recommended because they kill WebSockets and WebRTC signaling).*

### Step 1: Provision Cloud Databases (Free Tier)
1. **PostgreSQL**: Go to [Supabase](https://supabase.com) and create a free project. 
   - *Crucial for Render:* Render does not support IPv6. Go to Supabase Database Settings -> Connection Pooling, select **Session mode** (port 5432), and use that `pooler.supabase.com` URL.
2. **Redis**: Go to [Upstash](https://upstash.com) and create a free Redis database. Ensure you use the `rediss://` protocol for TLS encryption.

### Step 2: Deploy on Render
1. Create a new **Web Service** on Render and connect your GitHub repository.
2. Set the **Build Command** to:
   ```bash
   npm install --include=dev && npx prisma generate && npx prisma db push && npm run build
   ```
   *(We use `db push` instead of `migrate deploy` for seamless schema syncing without requiring local SQL generation).*
3. Set the **Start Command** to:
   ```bash
   npm run start
   ```

### Step 3: Environment Variables
Add the following Environment Variables in your Render dashboard:

| Key | Value | Example |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | `production` |
| `DATABASE_URL` | Your Supabase Session Pooler URL | `postgresql://...pooler.supabase.com:5432/postgres` |
| `REDIS_URL` | Your Upstash TLS URL | `rediss://default:xxxx@xxxx.upstash.io:6379` |
| `SESSION_SECRET` | A long random string | `e.g., 7297ede68653...` |
| `NEXT_PUBLIC_SOCKET_URL` | Your actual Render App URL | `https://browseros-ax13.onrender.com` |

Save and deploy! BrowserOS will boot up, connect to your cloud databases, and handle thousands of real-time WebSocket connections.

---

## 🏗 Architecture & Project Structure

The project follows a layered architecture with strict server/client separation (`server-only`). For a deep dive into the architecture, design choices, and alternatives, please see the internal documentation.

```text
browseros/
├── app/               # Next.js App Router (pages + REST API routes)
├── components/        # React components (Apps, Desktop, Taskbar, Window, Search)
├── hooks/             # Custom React hooks (useSocket, useWebRTC)
├── lib/               # Server-side logic (auth, db, redis, vfs, rbac, socket.io)
├── store/             # Zustand global state slices
├── types/             # Shared TypeScript types
├── registry/          # Application plugin registry
└── prisma/            # Prisma schema, migrations, and seed
```

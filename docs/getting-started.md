# Getting Started

Step-by-step guide to run the DaF ERP System locally.

---

## Prerequisites

- **Node.js** >= 18
- **Docker** & Docker Compose
- **npm** (comes with Node.js)

## 1. Clone the Repository

```bash
git clone https://github.com/AkhrorSoliev/daf-erp-system.git
cd daf-erp-system
```

## 2. Start Database & Redis

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** on port `5433` (user: `daf_user`, password: `daf_password`, db: `daf_erp`)
- **Redis 7** on port `6379`

## 3. Setup Backend

```bash
cd server
cp .env.example .env
npm install
```

Default `.env` values:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://daf_user:daf_password@localhost:5433/daf_erp?schema=public` |
| `JWT_SECRET` | Any secure string |
| `REDIS_HOST` | `localhost` |
| `REDIS_PORT` | `6379` |
| `PORT` | `4000` |

Run migrations and seed:

```bash
npx prisma migrate dev
npm run db:seed
```

Start the server:

```bash
npm run start:dev
```

Backend runs at `http://localhost:4000/api`

## 4. Setup Frontend

```bash
cd client
cp .env.example .env.local
npm install
```

Set the API URL in `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

Start the dev server:

```bash
npm run dev
```

Frontend runs at `http://localhost:3000`

## 5. Test Login

After seeding, these accounts are available:

| Login | Password | Role |
|-------|----------|------|
| `ceo` | `123456` | CEO |
| `admin` | `123456` | Administrator |
| `teacher` | `123456` | Teacher |

## Useful Commands

### Server

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Dev server with hot reload |
| `npm run build` | Build for production |
| `npm run start:prod` | Run production build |
| `npx prisma studio` | Open Prisma Studio (DB GUI) |
| `npx prisma migrate dev --name <name>` | Create new migration |
| `npm run db:seed` | Seed database |

### Client

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |

### Docker

| Command | Description |
|---------|-------------|
| `docker compose up -d` | Start PostgreSQL + Redis |
| `docker compose down` | Stop containers |
| `docker compose logs -f` | View logs |

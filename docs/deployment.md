# Deployment

Deploy frontend to **Vercel** and backend to **Railway**.

## Domains

| Service | Domain | Platform |
|---------|--------|----------|
| Main website | `dafzentrum.uz` | Separate project |
| Admin panel | `admin.dafzentrum.uz` | Vercel |
| API | `api.dafzentrum.uz` | Railway |

DNS is managed via **Cloudflare** (Full SSL mode).

---

## Frontend — Vercel

### Prerequisites
- Vercel CLI: `npm i -g vercel`
- Vercel account linked: `vercel login`

### Deploy

```bash
cd client
vercel --prod --yes
```

### Environment Variables (Vercel Dashboard)

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://api.dafzentrum.uz/api` |

### Custom Domain

`admin.dafzentrum.uz` — configured in Vercel Dashboard → Settings → Domains

## Backend — Railway

### Prerequisites
- Railway CLI: `npm i -g @railway/cli`
- Railway account linked: `railway login`

### Deploy

```bash
cd server
railway up --detach
```

### Environment Variables (Railway Dashboard)

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Railway PostgreSQL connection string |
| `JWT_SECRET` | Secure random string |
| `JWT_EXPIRATION` | `7d` |
| `REDIS_HOST` | Railway Redis host |
| `REDIS_PORT` | Railway Redis port |
| `REDIS_PASSWORD` | Railway Redis password |
| `PORT` | `4000` (or Railway default) |
| `NODE_ENV` | `production` |

### Custom Domain

`api.dafzentrum.uz` — CNAME points to `p93259ss.up.railway.app`

### After First Deploy

Run migrations and seed on Railway:

```bash
railway run npm run db:migrate:deploy
railway run npm run db:seed
```

## CORS

Backend CORS is configured in `server/src/main.ts`:

```typescript
app.enableCors({
  origin: [
    'http://localhost:3000',
    'https://client-brown-ten-36.vercel.app',
    'https://admin.dafzentrum.uz',
  ],
  credentials: true,
});
```

When adding new frontend domains, update this list.

## Quick Deploy (CLI Skill)

Run:

```
/deploy
```

This automatically:
1. Stages and commits changes
2. Updates relevant documentation (CLAUDE.md, docs/)
3. Creates a deploy branch
4. Pushes to origin
5. Deploys frontend to Vercel (if client/ changed)
6. Deploys backend to Railway (if server/ changed)
7. Creates a Pull Request and auto-merges it

## Build Scripts

The server `build` script already includes Prisma generation:

```json
{
  "build": "prisma generate && nest build",
  "db:migrate:deploy": "prisma migrate deploy",
  "db:seed": "ts-node prisma/seed.ts"
}
```

## Cloudflare DNS

DNS records managed at Cloudflare for `dafzentrum.uz`:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `216.198.79.1` | Proxied |
| CNAME | `admin` | Vercel | Proxied |
| CNAME | `api` | `p93259ss.up.railway.app` | DNS only |
| CNAME | `www` | Vercel | Proxied |

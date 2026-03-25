# Deployment

Deploy frontend to **Vercel** and backend to **Railway**.

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
| `NEXT_PUBLIC_API_URL` | `https://your-railway-backend.up.railway.app/api` |

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
| `REDIS_HOST` | Railway Redis host |
| `REDIS_PORT` | Railway Redis port |
| `PORT` | `4000` (or Railway default) |
| `NODE_ENV` | `production` |

### After First Deploy

Run migrations and seed on Railway:

```bash
railway run npm run db:migrate:deploy
railway run npm run db:seed
```

## Quick Deploy (CLI Skill)

If you have the `/deploy` skill installed, run:

```
/deploy
```

This automatically:
1. Stages and commits changes
2. Creates a deploy branch
3. Pushes to origin
4. Deploys frontend to Vercel
5. Deploys backend to Railway
6. Creates a Pull Request

## Build Scripts

The server `build` script already includes Prisma generation:

```json
{
  "build": "prisma generate && nest build",
  "db:migrate:deploy": "prisma migrate deploy",
  "db:seed": "ts-node prisma/seed.ts"
}
```

## CORS

Backend CORS is configured in `server/src/main.ts`. Update the origin when deploying to production:

```typescript
app.enableCors({
  origin: 'https://your-frontend-domain.vercel.app',
  credentials: true,
});
```

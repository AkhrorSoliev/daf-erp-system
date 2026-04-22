# Restart Dev Servers

Restart both frontend and backend development servers.

## Instructions

### 1. Stop existing processes
Kill any processes running on port 3000 (Next.js) and 4000 (NestJS):

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null; lsof -ti:4000 | xargs kill -9 2>/dev/null
```

Print: `Stopped existing servers`

### 2. Clean build caches
Remove Next.js and NestJS build caches to prevent disk bloat:

```bash
rm -rf client/.next && rm -rf server/dist
```

Print: `Build caches cleaned`

### 3. Start backend
```bash
cd server && npm run start:dev
```
Run in background.

Print: `Backend starting on port 4000...`

### 4. Start frontend
```bash
cd client && npm run dev
```
Run in background.

Print: `Frontend starting on port 3000...`

### 5. Summary
```
Dev servers started!
   Frontend: http://localhost:3000
   Backend:  http://localhost:4000
```

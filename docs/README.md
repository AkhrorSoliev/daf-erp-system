# DaF Sprachzentrum — ERP System

**A modern ERP platform for managing multi-branch language education centers**

---

## Overview

DaF ERP is a full-stack web application built for managing a multi-branch language school. It handles teachers, students, groups, courses, payments, leads, and reporting — all from a single dashboard with role-based access control.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS (TypeScript), Prisma ORM, PostgreSQL 16, Redis 7 |
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| **Auth** | JWT (Access + Refresh tokens), Passport.js |
| **State** | Zustand (client state), TanStack React Query (server state) |
| **Validation** | class-validator (server), Zod (client) |
| **Infrastructure** | Docker, Vercel, Railway |

## Documentation

### Backend (Server)

| Document | Description |
|----------|-------------|
| [Architecture](server/architecture.md) | Project structure, modules, conventions |
| [Authentication](server/authentication.md) | JWT flow, login/refresh, guards & decorators |
| [Database](server/database.md) | Prisma schema, models, relationships |
| [API Endpoints](server/api-endpoints.md) | Complete REST API reference |
| [Seed & Migrations](server/seed-and-migration.md) | Initial data, migration commands |

### Frontend (Client)

| Document | Description |
|----------|-------------|
| [Architecture](client/architecture.md) | Next.js structure, pages, routing |
| [Authentication](client/authentication.md) | Login flow, token management, middleware |
| [Components](client/components.md) | UI components, layout, navigation |
| [State Management](client/state-management.md) | Zustand stores, React Query patterns |
| [Forms & Validation](client/forms-and-validation.md) | react-hook-form, Zod schemas |

### General

| Document | Description |
|----------|-------------|
| [Getting Started](getting-started.md) | Setup guide to run the project locally |
| [Deployment](deployment.md) | Deploy to Vercel + Railway |
| [Data Conventions](data-conventions.md) | Phone, price, date formatting standards |
| [Role Access](role-access.md) | Role-based access control (RBAC) permission matrix |

---

DaF Sprachzentrum (c) 2026

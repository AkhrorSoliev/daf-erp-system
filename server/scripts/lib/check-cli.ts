/**
 * Shared helpers for the `check-*` CLI diagnostic scripts (check-student,
 * check-group, check-employee). READ-ONLY — these scripts never mutate data.
 *
 * Run against PROD via `railway run npx ts-node scripts/check-<x>.ts <id>`
 * (Railway injects the prod DATABASE_URL) or against the local dev DB directly
 * via `npx ts-node scripts/check-<x>.ts <id>` (uses server/.env).
 *
 * dotenv.config() does NOT override an already-set env var, so when launched
 * under `railway run` the injected prod DATABASE_URL wins over .env.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

export const SYSTEM_START = '2026-05-01'; // April cutover: pre-01.05 lessons are FREE
export const TEACHER_ROLE_ID = 4;

// ── formatters ────────────────────────────────────────────────────────────
export const som = (n: number | null | undefined) =>
  n == null ? '—' : Math.round(n).toLocaleString('ru-RU');
export const day = (d: unknown) => (d ? new Date(d as string).toISOString().slice(0, 10) : '—');
export const dt = (d: unknown) =>
  d ? new Date(d as string).toISOString().slice(0, 16).replace('T', ' ') : '—';
export const pct = (n: number | null | undefined) => `${n ?? 0}%`;

export function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').host;
  } catch {
    return '?';
  }
}

/**
 * PROD vs DEV. Both prod and the seeded dev DB live on Neon, so the host is not
 * a reliable signal — instead we detect `railway run`, which injects RAILWAY_*
 * env vars (and the prod DATABASE_URL). No RAILWAY_* → we're on the local .env.
 */
export function dbEnvLabel(): string {
  const railwayEnv = process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT;
  if (railwayEnv) {
    const proj = process.env.RAILWAY_PROJECT_NAME ? ` ${process.env.RAILWAY_PROJECT_NAME}` : '';
    return `PROD · railway:${railwayEnv}${proj}`;
  }
  const host = dbHost().toLowerCase();
  return /localhost|127\.0\.0\.1/.test(host) ? 'DEV · local' : 'DEV · .env';
}

// ── output ────────────────────────────────────────────────────────────────
export function printHeader(title: string) {
  const env = dbEnvLabel();
  console.log('═'.repeat(74));
  console.log(`  ${title}`);
  console.log(`  DB host: ${dbHost()}  [${env}]`);
  console.log('═'.repeat(74));
}

export function section(title: string) {
  const dashes = Math.max(3, 64 - title.length);
  console.log(`\n── ${title} ${'─'.repeat(dashes)}`);
}

/** Aligned plain-text table. aligns[i] === 'r' right-pads a column. */
export function printTable(
  headers: string[],
  rows: (string | number)[][],
  aligns: ('l' | 'r')[] = [],
) {
  const body = rows.map((r) => r.map((c) => String(c)));
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...body.map((r) => (r[i] ?? '').length), 0),
  );
  const fmt = (cells: string[]) =>
    cells.map((c, i) => (aligns[i] === 'r' ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ');
  console.log('  ' + fmt(headers));
  console.log('  ' + widths.map((w) => '─'.repeat(w)).join('  '));
  if (body.length === 0) {
    console.log("  (bo'sh)");
    return;
  }
  for (const r of body) console.log('  ' + fmt(r));
}

// ── runner + args ─────────────────────────────────────────────────────────
export function makePrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "DATABASE_URL topilmadi. Dev uchun server/.env bo'lishi kerak; prod uchun `railway run npx ts-node ...` ishlating.",
    );
    process.exit(1);
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export async function run(main: (prisma: PrismaClient) => Promise<void>) {
  const prisma = makePrisma();
  try {
    await main(prisma);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

export interface ParsedArgs {
  positional: string[];
  full: boolean;
  json: boolean;
  branch?: number;
}

/** Parses `process.argv`. Flags: --full, --json, --branch=<id>. */
export function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith('--'));
  const branchTok = argv.find((a) => a.startsWith('--branch='));
  return {
    positional,
    full: argv.includes('--full'),
    json: argv.includes('--json'),
    branch: branchTok ? Number(branchTok.split('=')[1]) : undefined,
  };
}

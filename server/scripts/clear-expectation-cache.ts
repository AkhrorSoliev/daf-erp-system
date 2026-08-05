/**
 * Clears the daily «Oy oxiriga kutilyapti» cache (`rpt:exp:*`).
 *
 * The figure is held for a whole Tashkent day, which is right for normal
 * operation — it barely moves within one. But after a change that DOES move it
 * (a group paused, a holiday added, a schedule edited) the cached value stays
 * stale until midnight. Run this to make the next read recompute.
 *
 * Only cache keys are touched; nothing in the database changes.
 *
 * `REDIS_HOST` is `redis.railway.internal`, which only resolves INSIDE
 * Railway's private network — `railway run` executes locally, so it cannot
 * reach it. Pass the TCP proxy instead (Railway → Redis service → Variables →
 * `RAILWAY_TCP_PROXY_DOMAIN` / `RAILWAY_TCP_PROXY_PORT`):
 *
 *   railway run env REDIS_HOST=<proxy-domain> REDIS_PORT=<proxy-port> \
 *     npx ts-node scripts/clear-expectation-cache.ts
 */
import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const host = process.env.REDIS_HOST ?? 'localhost';
  if (host.endsWith('.railway.internal')) {
    console.error(
      `REDIS_HOST=${host} faqat Railway ichidan ko'rinadi. TCP proxy bilan qayta yurgizing —\n` +
        '  railway run env REDIS_HOST=<proxy-domain> REDIS_PORT=<proxy-port> \\\n' +
        '    npx ts-node scripts/clear-expectation-cache.ts',
    );
    process.exit(1);
  }

  const redis = new Redis({
    host,
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
  });

  // SCAN, not KEYS — KEYS blocks the server, and this may run against prod.
  const found: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(
      cursor,
      'MATCH',
      'rpt:exp:*',
      'COUNT',
      200,
    );
    cursor = next;
    found.push(...batch);
  } while (cursor !== '0');

  if (found.length === 0) {
    console.log("Kesh bo'sh — tozalash shart emas.");
  } else {
    for (const k of found) console.log(`  o'chirildi: ${k}`);
    await redis.del(...found);
    console.log(`\n${found.length} ta kalit o'chirildi.`);
  }

  await redis.quit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

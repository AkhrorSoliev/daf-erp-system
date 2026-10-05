/**
 * One-off: store every `PaymentPromise.promiseDate` as the last millisecond of
 * its Tashkent day (`promiseDayEnd`, the rule new writes follow). The day a
 * row names never changes — only the instant inside that day.
 *
 * Dry run (default, read-only) — counts and promise ids:
 *   cd server && railway run npx ts-node scripts/normalise-promise-dates.ts
 *
 * Apply (writes; production only after the CEO has seen the dry run and said yes):
 *   cd server && railway run npx ts-node scripts/normalise-promise-dates.ts --apply --ha-men-tasdiqlayman
 *
 * Idempotent: a normalised row is not a candidate, and a row whose date
 * changed after it was read is skipped, so a second run finds nothing.
 * Statuses are not touched — the BROKEN rows the old cron flipped on their own
 * day are only counted, for the CEO to decide on.
 */
import { printHeader, run } from './lib/check-cli';
import {
  tashkentDateStr,
  TASHKENT_OFFSET_MS,
} from '../src/common/date/tashkent';
import { promiseDayEnd } from '../src/payment-promises/promise-rule';

/** 'HH:MM:SS.mmm' Tashkent wall clock of an instant. */
const tashkentClock = (d: Date) =>
  new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(11, 23);

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--ha-men-tasdiqlayman')) {
    console.error(
      "--apply yolg'iz ishlamaydi: va'da sanalari qayta yoziladi.\n" +
        "Avval quruq ishga tushirib, sonlarni CEO bilan ko'rib chiqing, keyin:\n" +
        '  npx ts-node scripts/normalise-promise-dates.ts --apply --ha-men-tasdiqlayman',
    );
    process.exit(1);
  }

  await run(async (prisma) => {
    printHeader(
      `Va'da sanasi — Toshkent kunining oxiri — ${apply ? 'APPLY' : 'DRY RUN'}`,
    );

    const rows = await prisma.paymentPromise.findMany({
      select: {
        id: true,
        status: true,
        promiseDate: true,
        reminderFiredAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const plans = rows
      .map((r) => ({ ...r, to: promiseDayEnd(r.promiseDate) }))
      .filter((p) => p.to.getTime() !== p.promiseDate.getTime());

    const byClock = new Map<string, number>();
    const byStatus = new Map<string, number>();
    for (const p of plans) {
      const clock = tashkentClock(p.promiseDate);
      byClock.set(clock, (byClock.get(clock) ?? 0) + 1);
      byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);
    }

    console.log(`Jami va'dalar: ${rows.length}`);
    console.log(`Allaqachon kun oxirida: ${rows.length - plans.length}`);
    console.log(`Qayta yoziladi: ${plans.length}`);
    for (const [clock, n] of [...byClock].sort()) {
      console.log(`  - Toshkent ${clock} da saqlangan: ${n}`);
    }
    for (const [status, n] of [...byStatus].sort()) {
      console.log(`  - ${status}: ${n}`);
    }

    // The bug's footprint: flipped to BROKEN on (or before) the promised day.
    const early = rows.filter(
      (r) =>
        r.status === 'BROKEN' &&
        r.reminderFiredAt != null &&
        tashkentDateStr(r.reminderFiredAt) <= tashkentDateStr(r.promiseDate),
    );
    console.log(
      `\nO'z kunida «buzildi» bo'lgan va'dalar (holati o'zgarmaydi): ${early.length}` +
        (early.length ? ` [${early.map((r) => r.id).join(', ')}]` : ''),
    );

    if (!apply) {
      console.log('\nDRY RUN — bazaga hech narsa yozilmadi.');
      return;
    }

    let applied = 0;
    const skipped: string[] = [];
    for (const p of plans) {
      // Guarded on the value read: a promise moved meanwhile is left alone.
      const { count } = await prisma.paymentPromise.updateMany({
        where: { id: p.id, promiseDate: p.promiseDate },
        data: { promiseDate: p.to },
      });
      if (count === 1) applied++;
      else skipped.push(p.id);
    }
    console.log(
      `\nYozildi: ${applied}. O'tkazib yuborildi: ${skipped.length}` +
        (skipped.length ? ` [${skipped.join(', ')}]` : ''),
    );
  });
}

// Importing this file (a test, another script) must not run it.
if (require.main === module) {
  main().catch((error) => {
    console.error('FAILED:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

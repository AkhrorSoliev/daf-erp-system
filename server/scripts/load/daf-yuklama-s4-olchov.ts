/**
 * LOCAL ONLY. S4 volume (spec S4 §8 «Yuklama», §12): the two audience queries
 * timed (first call, then 20 runs: p50 / p95), a full evening run and a full
 * Monday run through the REAL `SmsService` (an `SmsMessage` and a history row
 * per message) on a FAKE bot with no pacing and no Telegram: every audience
 * student gets exactly one message (HTML, under 4 096 characters, with the
 * stop button) and one SENT log row; a second run sends nothing; then
 * `GET fortschritt` over a random mix of students with and without a setting
 * row and with and without a chat. Exit 1 on any failure or when a p95 limit
 * is crossed.
 *
 *   --faza=yurish (default)  timings, one full run per kind, second run, projection, fortschritt
 *   --faza=poyga             50 parallel runs per kind (two cron instances racing): each
 *                            student claimed and messaged exactly once
 *
 * Needs `daf-yuklama-s4-seed.ts` from the same Tashkent day; each phase claims
 * the rows, so undo (`daf-yuklama-s4-tiklash.sql`) and seed again between
 * phases. The messages it writes (`SmsMessage`, `EntityHistory`) are removed
 * by the caller with `createdAt >= t0` (the script prints `t0`, a UTC ISO
 * timestamp taken before the first write).
 */
import { loadavg } from 'os';
import { Prisma } from '@prisma/client';
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { s4HaftalikKun, s4KechkiKun } from './daf-yuklama-kohort';
import { utcMidnightFromDateStr } from '../../src/common/date/tashkent';
import { EntityHistoryService } from '../../src/common/entity-history';
import { SmsService } from '../../src/sms/sms.service';
import { FortschrittService } from '../../src/daf/fortschritt/fortschritt.service';
import {
  haftalikAuditoriya,
  kechkiAuditoriya,
} from '../../src/daf/eslatma/eslatma-auditoriya';
import { EslatmaYuborish } from '../../src/daf/eslatma/eslatma-yuborish';
import { PAUZA_MS } from '../../src/daf/eslatma/eslatma-qoidalari';

assertLocalDb();

const OLCHOV = 20;
const AUDITORIYA_CHEGARA_MS = 2_000;
const PARALLEL = 50;
const ROUNDS = 10;
const FORTSCHRITT_CHEGARA_MS = 200;
const faza =
  process.argv.find((a) => a.startsWith('--faza='))?.split('=')[1] ?? 'yurish';

const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[
    Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))
  ];
const ozgina = (xs: number[]) => ({
  n: xs.length,
  p50: Math.round(pct(xs, 50)),
  p95: Math.round(pct(xs, 95)),
});

interface Markup {
  inline_keyboard: { callback_data?: string }[][];
}

type Tur = 'kechki' | 'haftalik';

run(async (prisma) => {
  const db = prisma as any;
  const K = s4KechkiKun();
  const H = s4HaftalikKun();
  const xatolar: string[] = [];
  // (7) No real Telegram: no bot token in this process, and the only bot the
  // SmsService can reach is the stub below (its `sendMessage` never leaves it).
  if (process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN o`rnatilgan — haqiqiy Telegram taqiqlangan.',
    );
  }
  const load0 = loadavg().map((x) => x.toFixed(2));
  const { companyId } = await prisma.student.findFirstOrThrow({
    where: { telegramChatId: { not: null } },
    orderBy: { id: 'asc' },
    select: { companyId: true },
  });
  const allaqachon = await prisma.dafReminderLog.count({
    where: {
      companyId,
      status: 'SENT',
      OR: [
        { kind: 'EVENING', sentOn: utcMidnightFromDateStr(K) },
        { kind: 'WEEKLY', sentOn: utcMidnightFromDateStr(H) },
      ],
    },
  });
  if (allaqachon > 0) {
    throw new Error(
      'Bu kunlar uchun allaqachon yuborilgan — tiklash SQL ini yurgizing va S4 seedini qayta yurgizing.',
    );
  }
  // Prisma stores timestamps as UTC; this run's rows are the ones created from here on.
  const t0 = new Date().toISOString();
  console.log({ faza, K, H, loadOldin: load0, t0 });

  // ---- The fake bot: counts every message per chat, checks its shape. ----
  let yuborilgan = 0;
  const chatSoni = new Map<string, number>();
  const bot = {
    telegram: {
      sendMessage: async (
        chat: string,
        matn: string,
        o: { parse_mode?: string; reply_markup?: Markup },
      ) => {
        yuborilgan += 1;
        chatSoni.set(chat, (chatSoni.get(chat) ?? 0) + 1);
        const tugma =
          o.reply_markup?.inline_keyboard[0]?.[0]?.callback_data ?? '';
        if (
          matn.length >= 4096 ||
          o.parse_mode !== 'HTML' ||
          !tugma.startsWith('dr:off:')
        ) {
          throw new Error(`noto'g'ri xabar: ${matn.slice(0, 60)}`);
        }
        return { message_id: yuborilgan };
      },
    },
  };
  const soxtaTelegram = { getBot: () => bot, soxta: true };
  const sms = new SmsService(
    db,
    soxtaTelegram as any,
    new EntityHistoryService(db, { emit: () => true } as any),
  );
  if (!(sms as any).telegramService?.soxta) {
    throw new Error('SmsService soxta Telegram bilan emas — to`xtatildi.');
  }
  const yuborish = new EslatmaYuborish(db, sms);
  const audit = (tur: Tur) =>
    tur === 'kechki'
      ? kechkiAuditoriya(db, companyId, K)
      : haftalikAuditoriya(db, companyId, H);
  const yur = (tur: Tur, y: EslatmaYuborish = yuborish) =>
    tur === 'kechki'
      ? y.kechki(companyId, K, 'on', 0)
      : y.haftalik(companyId, H, 'on', 0);
  const sentSoni = (tur: Tur) =>
    prisma.dafReminderLog.count({
      where: {
        companyId,
        kind: tur === 'kechki' ? 'EVENING' : 'WEEKLY',
        sentOn: utcMidnightFromDateStr(tur === 'kechki' ? K : H),
        status: 'SENT',
      },
    });
  /** SmsMessage rows this phase wrote: total, and students that got more than one. */
  const smsQatorlari = async () => {
    const [r] = await prisma.$queryRaw<
      { jami: number; sent: number; kopi: number }[]
    >`SELECT COUNT(*)::int AS jami,
             COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent,
             (SELECT COUNT(*)::int FROM (SELECT "studentId" FROM "SmsMessage"
                WHERE "createdAt" >= ${t0}::timestamp GROUP BY "studentId", content HAVING COUNT(*) > 1) x) AS kopi
      FROM "SmsMessage" WHERE "createdAt" >= ${t0}::timestamp`;
    return r;
  };

  const natija: Record<string, unknown> = { faza, K, H };

  if (faza === 'poyga') {
    // Two (here: 50) cron instances racing over the same audience.
    const poygalar: unknown[] = [];
    for (const tur of ['kechki', 'haftalik'] as const) {
      const auditoriya = (await audit(tur)).length;
      if (auditoriya === 0) xatolar.push(`${tur}: auditoriya bo'sh`);
      chatSoni.clear(); // one message per chat PER KIND
      const oldin = yuborilgan;
      const smsOld = (await smsQatorlari()).jami;
      const t = performance.now();
      const net = await Promise.all(
        Array.from({ length: PARALLEL }, () =>
          yur(tur, new EslatmaYuborish(db, sms)),
        ),
      );
      const ms = Math.round(performance.now() - t);
      const yuborildi = net.reduce((a, n) => a + n.yuborildi, 0);
      const jamiAuditoriya = net.reduce((a, n) => a + n.auditoriya, 0);
      const xato = net.reduce((a, n) => a + n.xato, 0);
      const otkazildi = net.reduce((a, n) => a + n.otkazildi, 0);
      const sent = await sentSoni(tur);
      const s = await smsQatorlari();
      const eng = Math.max(...chatSoni.values());
      const qator = {
        tur,
        auditoriya,
        nusxa: PARALLEL,
        ms,
        yuborildi,
        xato,
        otkazildi,
        botgaXabar: yuborilgan - oldin,
        sentQator: sent,
        smsQator: s.jami - smsOld,
        bittadanKop: s.kopi,
        engKopXabarBirChatga: eng,
      };
      poygalar.push(qator);
      if (
        yuborildi !== auditoriya ||
        jamiAuditoriya !== yuborildi + otkazildi + xato ||
        xato !== 0 ||
        yuborilgan - oldin !== auditoriya ||
        sent !== auditoriya ||
        s.jami - smsOld !== auditoriya ||
        s.kopi !== 0 ||
        eng !== 1
      ) {
        xatolar.push(`${tur} poyga: ${JSON.stringify(qator)}`);
      }
      const ikkinchi = await yur(tur);
      if (ikkinchi.auditoriya !== 0 || ikkinchi.yuborildi !== 0) {
        xatolar.push(
          `${tur}: poygadan keyingi yurish ${JSON.stringify(ikkinchi)}`,
        );
      }
    }
    console.table(poygalar);
    natija.poygalar = poygalar;
  } else {
    // (1) The two audience queries: first call of this process, then 20 runs.
    const vaqt = async (tur: Tur) => {
      let birinchi = 0;
      let n = 0;
      const bosh = performance.now();
      n = (await audit(tur)).length;
      birinchi = Math.round(performance.now() - bosh);
      const xs: number[] = [];
      for (let i = 0; i < OLCHOV; i += 1) {
        const t = performance.now();
        await audit(tur);
        xs.push(performance.now() - t);
      }
      const o = ozgina(xs);
      if (o.p95 >= AUDITORIYA_CHEGARA_MS || birinchi >= AUDITORIYA_CHEGARA_MS) {
        xatolar.push(
          `${tur} auditoriya p95 ${o.p95} ms, birinchi ${birinchi} ms`,
        );
      }
      return { amal: `${tur} auditoriya`, auditoriya: n, birinchi, ...o };
    };
    const auditoriyaVaqti = [await vaqt('kechki'), await vaqt('haftalik')];
    console.table(auditoriyaVaqti);
    natija.auditoriyaVaqti = auditoriyaVaqti;

    // (2), (3) One full run per kind through the real SmsService on the fake bot.
    const yurish = async (tur: Tur) => {
      const kind = tur === 'kechki' ? 'EVENING' : 'WEEKLY';
      const auditoriya = (await audit(tur)).length;
      const oldin = yuborilgan;
      const smsOld = (await smsQatorlari()).jami;
      const t = performance.now();
      const n = await yur(tur);
      const ms = Math.round(performance.now() - t);
      const sent = await sentSoni(tur);
      const failed = await prisma.dafReminderLog.count({
        where: {
          companyId,
          kind,
          sentOn: utcMidnightFromDateStr(tur === 'kechki' ? K : H),
          status: 'FAILED',
          // the seed's own FAILED rows are not this run's
          createdAt: { gte: new Date(t0) },
        },
      });
      const s = await smsQatorlari();
      if (auditoriya === 0) {
        xatolar.push(
          `${tur}: auditoriya bo'sh — sinov hech narsani isbotlamaydi`,
        );
      }
      if (
        n.auditoriya !== auditoriya ||
        n.yuborildi !== auditoriya ||
        n.xato !== 0 ||
        n.otkazildi !== 0 ||
        yuborilgan - oldin !== auditoriya
      ) {
        xatolar.push(
          `${tur}: ${JSON.stringify(n)}, botga ${yuborilgan - oldin} ≠ ${auditoriya}`,
        );
      }
      if (sent !== auditoriya)
        xatolar.push(`${tur}: SENT qatorlar ${sent} ≠ ${auditoriya}`);
      if (failed !== 0)
        xatolar.push(`${tur}: bu yurishdagi FAILED qatorlar ${failed}`);
      if (s.jami - smsOld !== auditoriya || s.kopi !== 0) {
        xatolar.push(
          `${tur}: SmsMessage ${s.jami - smsOld} ≠ ${auditoriya}, takror ${s.kopi}`,
        );
      }
      const ikkinchi = await yur(tur);
      if (ikkinchi.auditoriya !== 0 || ikkinchi.yuborildi !== 0) {
        xatolar.push(`${tur}: ikkinchi yurish ${JSON.stringify(ikkinchi)}`);
      }
      // (4) Computed, not waited: wall time here + one PAUZA_MS per message.
      return {
        tur,
        auditoriya,
        ms,
        msXabarga: +(ms / auditoriya).toFixed(1),
        sent,
        failed,
        smsQator: s.jami - smsOld,
        ikkinchiYurish: ikkinchi.yuborildi,
        prodTaxminiyS: Math.round((ms + auditoriya * PAUZA_MS) / 1000),
      };
    };
    const yurishlar = [await yurish('kechki'), await yurish('haftalik')];
    console.table(yurishlar);
    natija.yurishlar = yurishlar;

    // (5) `GET fortschritt` over a random mix: with / without a setting row,
    // with / without a chat (connected, disconnected, none).
    const svc = new FortschrittService(db);
    const qatlam = (nomi: string, shart: Prisma.Sql) => [nomi, shart] as const;
    const qatlamlar = [
      qatlam(
        'chat + sozlama qatori',
        Prisma.sql`s."telegramChatId" IS NOT NULL AND s."telegramDisconnectedAt" IS NULL AND st."studentId" IS NOT NULL`,
      ),
      qatlam(
        'chat, sozlama qatorisiz',
        Prisma.sql`s."telegramChatId" IS NOT NULL AND s."telegramDisconnectedAt" IS NULL AND st."studentId" IS NULL`,
      ),
      qatlam(
        'uzilgan chat',
        Prisma.sql`s."telegramDisconnectedAt" IS NOT NULL`,
      ),
      qatlam('chatsiz', Prisma.sql`s."telegramChatId" IS NULL`),
    ];
    const hammasi: number[] = [];
    const qatlamVaqti = new Map<string, number[]>(
      qatlamlar.map(([n]) => [n, []]),
    );
    for (let round = 0; round < ROUNDS; round += 1) {
      const guruh: { id: number; companyId: number; q: string }[] = [];
      for (const [nomi, shart] of qatlamlar) {
        const rows = await prisma.$queryRaw<
          { id: number; companyId: number }[]
        >(
          Prisma.sql`SELECT s.id, s."companyId" FROM "Student" s
            LEFT JOIN "DafStudentSetting" st ON st."studentId" = s.id
            WHERE s."deletedAt" IS NULL AND ${shart}
            ORDER BY random() LIMIT ${Math.ceil(PARALLEL / qatlamlar.length)}`,
        );
        guruh.push(...rows.map((r) => ({ ...r, q: nomi })));
      }
      const ms = await Promise.all(
        guruh.slice(0, PARALLEL).map(async (s) => {
          const t = performance.now();
          await svc.uebersicht(s.id, s.companyId);
          return { q: s.q, ms: performance.now() - t };
        }),
      );
      for (const m of ms) {
        hammasi.push(m.ms);
        qatlamVaqti.get(m.q)!.push(m.ms);
      }
    }
    const fortschritt = [
      {
        amal: 'fortschritt · tasodifiy aralash',
        ...ozgina(hammasi),
        chegara: FORTSCHRITT_CHEGARA_MS,
      },
      ...[...qatlamVaqti].map(([q, xs]) => ({
        amal: `fortschritt · ${q}`,
        ...(xs.length > 0 ? ozgina(xs) : { n: 0, p50: 0, p95: 0 }),
        chegara: FORTSCHRITT_CHEGARA_MS,
      })),
    ];
    for (const [q, xs] of qatlamVaqti) {
      if (xs.length === 0)
        xatolar.push(
          `fortschritt · ${q}: qatlamda o'quvchi yo'q (S4 seedi yurgizilganmi?)`,
        );
    }
    console.table(fortschritt);
    natija.fortschritt = fortschritt;
    if (fortschritt[0].p95 >= FORTSCHRITT_CHEGARA_MS) {
      xatolar.push(`fortschritt aralash p95 ${fortschritt[0].p95} ms`);
    }
  }

  const [{ smsSoni, tarixSoni }] = await prisma.$queryRaw<
    { smsSoni: number; tarixSoni: number }[]
  >`SELECT (SELECT COUNT(*)::int FROM "SmsMessage" WHERE "createdAt" >= ${t0}::timestamp) AS "smsSoni",
           (SELECT COUNT(*)::int FROM "EntityHistory" WHERE "createdAt" >= ${t0}::timestamp) AS "tarixSoni"`;
  console.log({
    faza,
    K,
    H,
    t0,
    smsQatorlari: smsSoni,
    tarixQatorlari: tarixSoni,
    loadOldin: load0,
    loadKeyin: loadavg().map((x) => x.toFixed(2)),
    xatolar: xatolar.length,
  });
  console.log(JSON.stringify(natija));
  for (const x of xatolar.slice(0, 20)) console.log(x);
  if (xatolar.length > 0) process.exitCode = 1;
});

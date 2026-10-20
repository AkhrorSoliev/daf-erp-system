/**
 * LOCAL ONLY. S4 audience SQL against a brute force (spec S4 §8 «Haqiqiy
 * baza»): `kechkiAuditoriya` for the evening day `s4KechkiKun()` (tomorrow)
 * and `haftalikAuditoriya` for this week's Monday `s4HaftalikKun()`, rebuilt
 * row by row from `Student`, `DafStudentSetting`, `DafStudentDay`,
 * `DafReminderLog`, `DafLeagueEntry`, `DafGroupWeek` and `DafStudentBadge`
 * with the pure rules (`kechkiNomzodmi`, `haftalikNomzodmi`, `serieAus`):
 * the same students, names, streaks, goals, points, league line, group line
 * and badges. Plus `haftaTayyormi` against a count of unsettled rooms. Exit 1
 * on any difference or when an audience is empty.
 */
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { s4HaftalikKun, s4KechkiKun } from './daf-yuklama-kohort';
import {
  addDaysToDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../src/common/date/tashkent';
import { serieAus } from '../../src/daf/uebung/punkte';
import {
  haftaTayyormi,
  haftalikAuditoriya,
  kechkiAuditoriya,
} from '../../src/daf/eslatma/eslatma-auditoriya';
import {
  haftalikNomzodmi,
  kechkiNomzodmi,
  type JurnalYozuvi,
} from '../../src/daf/eslatma/eslatma-qoidalari';

assertLocalDb();

function qosh<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
}

run(async (prisma) => {
  const db = prisma as any;
  const K = s4KechkiKun();
  const H = s4HaftalikKun();
  const otgan = addDaysToDateStr(H, -7);
  const xatolar: string[] = [];
  const farq = (nima: string, a: unknown, b: unknown) => {
    const [sa, sb] = [JSON.stringify(a), JSON.stringify(b)];
    if (sa !== sb)
      xatolar.push(`${nima}: ${sa.slice(0, 300)} ≠ ${sb.slice(0, 300)}`);
  };
  const kompaniyalar = await prisma.student.findMany({
    where: { telegramChatId: { not: null } },
    distinct: ['companyId'],
    select: { companyId: true },
  });
  let kechkiJami = 0;
  let haftalikJami = 0;
  for (const { companyId } of kompaniyalar) {
    const W = utcMidnightFromDateStr(otgan);
    const [
      oquvchilar,
      sozlamalar,
      kunlar,
      jurnal,
      kirishlar,
      guruhHaftalari,
      nishonlar,
    ] = await Promise.all([
      prisma.student.findMany({
        where: { companyId },
        select: {
          id: true,
          firstName: true,
          deletedAt: true,
          telegramChatId: true,
          telegramDisconnectedAt: true,
        },
      }),
      prisma.dafStudentSetting.findMany({
        where: { companyId },
        select: { studentId: true, remindersEnabled: true, dailyGoal: true },
      }),
      prisma.dafStudentDay.findMany({
        where: { companyId },
        select: {
          studentId: true,
          day: true,
          attempts: true,
          points: true,
          groupKey: true,
        },
      }),
      prisma.dafReminderLog.findMany({
        where: { companyId },
        select: { studentId: true, kind: true, sentOn: true, status: true },
      }),
      prisma.dafLeagueEntry.findMany({
        where: { companyId, weekStart: W },
        select: { studentId: true, tier: true, place: true, promoted: true },
      }),
      prisma.dafGroupWeek.findMany({
        where: { companyId, weekStart: W },
        select: { groupId: true, place: true },
      }),
      prisma.dafStudentBadge.findMany({
        where: { companyId },
        select: { studentId: true, key: true, earnedAt: true },
      }),
    ]);
    const sozlama = new Map(sozlamalar.map((s) => [s.studentId, s]));
    const kun = new Map<number, string[]>();
    const tage = new Map<number, string[]>();
    const haftaBall = new Map<number, number>();
    const guruhBall = new Map<number, Map<string, number>>();
    for (const d of kunlar) {
      const k = tashkentDateStr(d.day);
      qosh(kun, d.studentId, k);
      if (d.attempts > 0) qosh(tage, d.studentId, k);
      if (k >= otgan && k < H) {
        haftaBall.set(
          d.studentId,
          (haftaBall.get(d.studentId) ?? 0) + d.points,
        );
        if (d.groupKey !== '') {
          const g = guruhBall.get(d.studentId) ?? new Map<string, number>();
          g.set(d.groupKey, (g.get(d.groupKey) ?? 0) + d.points);
          guruhBall.set(d.studentId, g);
        }
      }
    }
    const yozuvlar = new Map<number, JurnalYozuvi[]>();
    for (const j of jurnal) {
      qosh(yozuvlar, j.studentId, {
        kind: j.kind,
        sentOn: tashkentDateStr(j.sentOn),
        status: j.status,
      });
    }
    const fakt = (s: (typeof oquvchilar)[0]) => ({
      ochirilgan: s.deletedAt !== null,
      chatId: s.telegramChatId,
      uzilgan: s.telegramDisconnectedAt !== null,
      eslatmalar: sozlama.get(s.id)?.remindersEnabled ?? true,
      jurnal: yozuvlar.get(s.id) ?? [],
    });
    const tartibda = [...oquvchilar].sort((a, b) => a.id - b.id);

    // Kechki eslatma.
    const kechkiKerak = tartibda
      .filter((s) =>
        kechkiNomzodmi({ ...fakt(s), kunlar: kun.get(s.id) ?? [] }, K),
      )
      .map((s) => [
        s.id,
        s.firstName,
        serieAus(
          (tage.get(s.id) ?? []).filter((d) => d < K),
          K,
        ),
        sozlama.get(s.id)?.dailyGoal ?? null,
      ]);
    const kechkiSql = (await kechkiAuditoriya(db, companyId, K)).map((q) => [
      q.studentId,
      q.ism,
      q.seriya,
      q.dailyGoal,
    ]);
    farq(`kechki (kompaniya ${companyId})`, kechkiSql, kechkiKerak);

    // Dushanba xulosasi.
    const kirish = new Map(kirishlar.map((e) => [e.studentId, e]));
    const gwOrin = new Map(guruhHaftalari.map((g) => [g.groupId, g.place]));
    const nishon = new Map<number, { key: string; earnedAt: Date }[]>();
    for (const b of nishonlar) {
      const k = tashkentDateStr(b.earnedAt);
      if (k >= otgan && k < H) qosh(nishon, b.studentId, b);
    }
    const engKopGuruh = (id: number): string | null => {
      let eng: [string, number] | null = null;
      for (const [g, p] of guruhBall.get(id) ?? []) {
        if (!eng || p > eng[1] || (p === eng[1] && g < eng[0])) eng = [g, p];
      }
      return eng?.[0] ?? null;
    };
    const haftalikKerak = tartibda
      .filter((s) =>
        haftalikNomzodmi(
          { ...fakt(s), otganHaftaBall: haftaBall.get(s.id) ?? 0 },
          H,
        ),
      )
      .map((s) => {
        const e = kirish.get(s.id);
        const g = engKopGuruh(s.id);
        const keys = [...(nishon.get(s.id) ?? [])]
          .sort(
            (a, b) =>
              a.earnedAt.getTime() - b.earnedAt.getTime() ||
              (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
          )
          .map((b) => b.key);
        return [
          s.id,
          s.firstName,
          haftaBall.get(s.id) ?? 0,
          e?.tier ?? null,
          e?.place ?? null,
          e?.promoted ?? false,
          g !== null ? (gwOrin.get(g) ?? null) : null,
          guruhHaftalari.length,
          keys,
        ];
      });
    const haftalikSql = (await haftalikAuditoriya(db, companyId, H)).map(
      (q) => [
        q.studentId,
        q.ism,
        q.ball,
        q.tier,
        q.orin,
        q.kotarildi,
        q.guruhOrin,
        q.guruhJami,
        q.nishonlar,
      ],
    );
    farq(`haftalik (kompaniya ${companyId})`, haftalikSql, haftalikKerak);

    // Tayyorlik.
    const ochiq = await prisma.dafLeagueRoom.count({
      where: {
        companyId,
        settledAt: null,
        weekStart: { lt: utcMidnightFromDateStr(H) },
      },
    });
    farq(
      `tayyorlik (kompaniya ${companyId})`,
      await haftaTayyormi(db, companyId, H),
      ochiq === 0,
    );

    kechkiJami += kechkiKerak.length;
    haftalikJami += haftalikKerak.length;
  }
  if (kechkiJami === 0)
    xatolar.push(
      "kechki auditoriya bo'sh — solishtirish hech narsani isbotlamaydi",
    );
  if (haftalikJami === 0)
    xatolar.push(
      "haftalik auditoriya bo'sh — solishtirish hech narsani isbotlamaydi",
    );
  console.log({
    K,
    H,
    kechki: kechkiJami,
    haftalik: haftalikJami,
    xatolar: xatolar.length,
  });
  for (const x of xatolar.slice(0, 20)) console.log(x);
  if (xatolar.length > 0) process.exitCode = 1;
});

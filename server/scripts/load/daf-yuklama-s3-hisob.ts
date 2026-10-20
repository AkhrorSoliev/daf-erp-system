/**
 * LOCAL ONLY. S3 `settleWeek` on the load-test DB (spec S3 §7 «Haqiqiy
 * baza»): last week's rooms (`daf-yuklama-s3-seed.ts`) are settled once,
 * timed, and checked against a brute-force read of `DafStudentDay`: every
 * member placed, places 1..n per room, points = the week's sum over all
 * group keys, promotions exactly where the rule allows, promoted ≤ 5 × rooms,
 * tiers never lower, a second run changes nothing, the new week's rooms are
 * even per tier, the group week has one row per eligible group. Exit 1 on any
 * failure or when the settlement takes 60 s or more.
 *
 * Also an independent brute force over EVERY group (raw rows + enrollments, in
 * JS) against the stored `DafGroupWeek` and against `guruhlarYigindisi`, and
 * over EVERY room of the new week against `ligaJavobi` (the live read).
 */
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { settleDue } from '../../src/daf/liga/liga-hisob';
import { guruhlarYigindisi } from '../../src/daf/liga/guruhlar-jadvali';
import { ligaJavobi } from '../../src/daf/liga/liga-xona';
import {
  ENG_YUQORI_DARAJA,
  KOTARILISH_MIN_AZO,
  KOTARILISH_MIN_BALL,
  KOTARILISH_SONI,
  XONA_SIGIMI,
  guruhlarniSarala,
} from '../../src/daf/liga/liga-qoidalari';
import { addDaysToDateStr } from '../../src/attendance/shared/date-utils';
import { utcMidnightFromDateStr } from '../../src/common/date/tashkent';
import { wochenStartTag } from '../../src/daf/uebung/punkte';

assertLocalDb();

const VAQT_CHEGARASI_MS = 60_000;

run(async (prisma) => {
  const jetzt = new Date();
  const joriy = wochenStartTag(jetzt);
  const otgan = addDaysToDateStr(joriy, -7);
  const W = utcMidnightFromDateStr(otgan);
  const J = utcMidnightFromDateStr(joriy);
  const { companyId } = await prisma.dafLeagueRoom.findFirstOrThrow({
    where: { weekStart: W },
  });
  const xatolar: string[] = [];
  const tekshir = (shart: boolean, nima: string) => {
    if (!shart) xatolar.push(nima);
  };

  const oldingiDaraja = new Map(
    (
      await prisma.dafStudentLeague.findMany({
        select: { studentId: true, tier: true },
      })
    ).map((d) => [d.studentId, d.tier]),
  );

  const t0 = performance.now();
  const birinchi = await settleDue(prisma as any, companyId, jetzt, {
    kutish: true,
  });
  const ms = Math.round(performance.now() - t0);

  const xonalar = await prisma.dafLeagueRoom.findMany({
    where: { weekStart: W },
    select: { id: true, tier: true, settledAt: true },
  });
  const kirishlar = await prisma.dafLeagueEntry.findMany({
    where: { weekStart: W },
    select: {
      id: true,
      roomId: true,
      studentId: true,
      place: true,
      points: true,
      promoted: true,
    },
    orderBy: { id: 'asc' },
  });
  // Brute force: the week's points per student over ALL group keys.
  const kunlar = await prisma.dafStudentDay.findMany({
    where: { day: { gte: W, lt: J } },
    select: { studentId: true, points: true, groupKey: true },
  });
  const ball = new Map<number, number>();
  const guruhBall = new Map<string, number>();
  for (const k of kunlar) {
    ball.set(k.studentId, (ball.get(k.studentId) ?? 0) + k.points);
    const kalit = `${k.studentId}|${k.groupKey}`;
    guruhBall.set(kalit, (guruhBall.get(kalit) ?? 0) + k.points);
  }

  tekshir(
    xonalar.every((x) => x.settledAt !== null),
    'hamma xona hisoblangan',
  );
  tekshir(
    kirishlar.every((k) => k.place !== null),
    "Σ place satrlari = a'zolar soni",
  );
  const kotarilganlar = kirishlar.filter((k) => k.promoted).length;
  tekshir(
    kotarilganlar <= KOTARILISH_SONI * xonalar.length,
    "ko'tarilganlar ≤ 5 × xonalar",
  );
  const tierOf = new Map(xonalar.map((x) => [x.id, x.tier]));
  const boyicha = new Map<number, typeof kirishlar>();
  for (const k of kirishlar)
    boyicha.set(k.roomId, [...(boyicha.get(k.roomId) ?? []), k]);
  for (const [roomId, list] of boyicha) {
    const tier = tierOf.get(roomId)!;
    const tartib = [...list].sort(
      (a, b) =>
        (ball.get(b.studentId) ?? 0) - (ball.get(a.studentId) ?? 0) ||
        a.studentId - b.studentId,
    );
    tartib.forEach((k, i) => {
      const p = ball.get(k.studentId) ?? 0;
      const kerak =
        list.length >= KOTARILISH_MIN_AZO &&
        tier < ENG_YUQORI_DARAJA &&
        i < KOTARILISH_SONI &&
        p >= KOTARILISH_MIN_BALL;
      if (k.place !== i + 1 || k.points !== p || k.promoted !== kerak)
        xatolar.push(
          `xona ${roomId}, o'quvchi ${k.studentId}: ${k.place}/${k.points}/${k.promoted} ≠ ${i + 1}/${p}/${kerak}`,
        );
    });
  }

  const keyingiDaraja = new Map(
    (
      await prisma.dafStudentLeague.findMany({
        select: { studentId: true, tier: true },
      })
    ).map((d) => [d.studentId, d.tier]),
  );
  for (const k of kirishlar) {
    const oldin = oldingiDaraja.get(k.studentId) ?? 0;
    const hozir = keyingiDaraja.get(k.studentId) ?? 0;
    if (hozir < oldin) xatolar.push(`daraja tushdi: ${k.studentId}`);
    if (k.promoted && hozir !== Math.max(oldin, tierOf.get(k.roomId)! + 1))
      xatolar.push(`ko'tarilish yozilmadi: ${k.studentId}`);
    if (!k.promoted && hozir !== oldin)
      xatolar.push(`daraja o'zgardi: ${k.studentId}`);
  }

  // Next week = this week: exactly the members with ≥ 1 point, even per tier.
  const faollar = new Set(
    kirishlar.filter((k) => (k.points ?? 0) >= 1).map((k) => k.studentId),
  );
  const yangilar = await prisma.dafLeagueEntry.findMany({
    where: { weekStart: J },
    select: { studentId: true, roomId: true, tier: true },
  });
  tekshir(
    yangilar.length === faollar.size &&
      yangilar.every((y) => faollar.has(y.studentId)),
    'yangi hafta = ≥ 1 ball topganlar',
  );
  tekshir(
    yangilar.every((y) => y.tier === (keyingiDaraja.get(y.studentId) ?? 0)),
    'yangi xona — yangi daraja',
  );
  const hajmlar = new Map<string, number>();
  for (const y of yangilar)
    hajmlar.set(
      `${y.tier}|${y.roomId}`,
      (hajmlar.get(`${y.tier}|${y.roomId}`) ?? 0) + 1,
    );
  for (let tier = 0; tier <= ENG_YUQORI_DARAJA; tier += 1) {
    const h = [...hajmlar]
      .filter(([k]) => k.startsWith(`${tier}|`))
      .map(([, n]) => n);
    if (
      h.length > 0 &&
      (Math.max(...h) - Math.min(...h) > 1 || Math.max(...h) > XONA_SIGIMI)
    )
      xatolar.push(`daraja ${tier}: xonalar teng emas (${h.join(', ')})`);
  }

  const guruhlar = guruhlarniSarala(
    await guruhlarYigindisi(prisma as any, companyId, otgan),
  );
  tekshir(
    (await prisma.dafGroupWeek.count({ where: { weekStart: W } })) ===
      guruhlar.length,
    'guruh haftasi = jadval',
  );

  // Brute force over ALL groups: ACTIVE live groups, current ACTIVE members,
  // points with groupKey = the group, ≥ 3 members, average DESC then id ASC.
  const faolGuruhlar = await prisma.group.findMany({
    where: { companyId, statusEnum: 'ACTIVE', deletedAt: null },
    select: {
      id: true,
      enrollments: { where: { status: 'ACTIVE' }, select: { studentId: true } },
    },
  });
  const brute = faolGuruhlar
    .map((g) => {
      const ids = [...new Set(g.enrollments.map((e) => e.studentId))];
      const jami = ids.reduce(
        (sum, id) => sum + (guruhBall.get(`${id}|${g.id}`) ?? 0),
        0,
      );
      return {
        groupId: g.id,
        azolar: ids.length,
        ball: jami,
        baho: jami / Math.max(ids.length, 1),
      };
    })
    .filter((g) => g.azolar >= 3)
    .sort(
      (a, b) =>
        b.baho - a.baho ||
        (a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 : 0),
    );
  const saqlangan = await prisma.dafGroupWeek.findMany({
    where: { weekStart: W },
    orderBy: { place: 'asc' },
  });
  let guruhFarq = 0;
  tekshir(
    saqlangan.length === brute.length,
    `guruhlar soni ${saqlangan.length} ≠ ${brute.length}`,
  );
  brute.forEach((g, i) => {
    const s = saqlangan[i];
    if (
      !s ||
      s.groupId !== g.groupId ||
      s.place !== i + 1 ||
      s.members !== g.azolar ||
      s.points !== g.ball ||
      Math.abs(s.average - g.baho) > 1e-9
    ) {
      guruhFarq += 1;
      if (guruhFarq <= 5)
        xatolar.push(
          `guruh ${g.groupId}: ${JSON.stringify(s)} ≠ ${JSON.stringify(g)}`,
        );
    }
  });
  tekshir(
    JSON.stringify(
      guruhlar.map((g) => [g.groupId, g.place, g.azolar, g.ball]),
    ) ===
      JSON.stringify(brute.map((g, i) => [g.groupId, i + 1, g.azolar, g.ball])),
    'guruhlarYigindisi ≠ brute force',
  );

  // Brute force over ALL rooms of the new week against the live read.
  const joriyKunlar = await prisma.dafStudentDay.findMany({
    where: { day: { gte: J, lt: new Date(J.getTime() + 7 * 86_400_000) } },
    select: { studentId: true, points: true },
  });
  const joriyBall = new Map<number, number>();
  for (const k of joriyKunlar)
    joriyBall.set(k.studentId, (joriyBall.get(k.studentId) ?? 0) + k.points);
  const yangiXonalar = new Map<number, number[]>();
  for (const y of yangilar)
    yangiXonalar.set(y.roomId, [
      ...(yangiXonalar.get(y.roomId) ?? []),
      y.studentId,
    ]);
  let xonaFarq = 0;
  for (const [roomId, azolar] of yangiXonalar) {
    const kutilgan = azolar
      .map((id) => ({ id, p: joriyBall.get(id) ?? 0 }))
      .sort((a, b) => b.p - a.p || a.id - b.id)
      .map((a, i) => [a.id, i + 1, a.p]);
    const j = await ligaJavobi(prisma as any, azolar[0], jetzt);
    const bor = j.xona?.qatorlar.map((q) => [q.studentId, q.platz, q.punkte]);
    if (JSON.stringify(bor) !== JSON.stringify(kutilgan)) {
      xonaFarq += 1;
      if (xonaFarq <= 5)
        xatolar.push(`yangi xona ${roomId}: jadval brute force'ga teng emas`);
    }
  }

  // Idempotent: a second run settles nothing and changes nothing.
  const surat = () =>
    Promise.all([
      prisma.dafLeagueEntry.findMany({ orderBy: { id: 'asc' } }),
      prisma.dafStudentLeague.findMany({ orderBy: { studentId: 'asc' } }),
      prisma.dafGroupWeek.count(),
      prisma.dafLeagueRoom.count(),
    ]).then((x) => JSON.stringify(x));
  const oldinSurat = await surat();
  const ikkinchi = await settleDue(prisma as any, companyId, jetzt, {
    kutish: true,
  });
  tekshir(
    ikkinchi.every((n) => n.xonalar === 0 && n.kotarildi === 0),
    'ikkinchi hisob hech narsa olmadi',
  );
  tekshir(
    (await surat()) === oldinSurat,
    "ikkinchi hisob hech narsani o'zgartirmadi",
  );
  tekshir(ms < VAQT_CHEGARASI_MS, `hisob ${VAQT_CHEGARASI_MS} ms dan tez`);

  console.log({
    ms,
    birinchi,
    xonalar: xonalar.length,
    azolar: kirishlar.length,
    kotarilganlar,
    yangiHaftaAzolari: yangilar.length,
    guruhlar: guruhlar.length,
    guruhFarq,
    tekshirilganYangiXonalar: yangiXonalar.size,
    xonaFarq,
    xatolar: xatolar.length,
  });
  for (const x of xatolar.slice(0, 20)) console.log(x);
  if (xatolar.length > 0) process.exitCode = 1;
});

import type { Prisma } from '@prisma/client';

/** Days and weeks are 'YYYY-MM-DD' strings, exactly as the SQL binds them. */
export interface FakeXona {
  id: number;
  companyId: number;
  weekStart: string;
  tier: number;
  number: number;
  settledAt: Date | null;
}

export interface FakeKirish {
  id: number;
  roomId: number;
  studentId: number;
  companyId: number;
  weekStart: string;
  tier: number;
  place: number | null;
  points: number | null;
  promoted: boolean;
}

export interface FakeKun {
  studentId: number;
  companyId: number;
  day: string;
  groupKey: string;
  points: number;
}

export interface FakeGuruhHafta {
  companyId: number;
  weekStart: string;
  groupId: string;
  place: number;
  average: number;
  members: number;
  points: number;
}

export interface LigaBazaHolati {
  xonalar: FakeXona[];
  kirishlar: FakeKirish[];
  /** DafStudentLeague: studentId → tier. */
  darajalar: Map<number, number>;
  kunlar: FakeKun[];
  /** ACTIVE enrollments of ACTIVE, live groups. */
  azolik: { groupId: string; studentId: number }[];
  guruhNomlari: Map<string, string>;
  guruhHaftalari: FakeGuruhHafta[];
  ismlar: Map<number, [string, string]>;
  /** What `pg_try_advisory_xact_lock` answers. */
  qulfBosh: boolean;
  /** Every query's marker, in call order. */
  chaqiruvlar: string[];
}

const kunQosh = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

const dushanba = (d: string) => {
  const w = new Date(`${d}T00:00:00Z`).getUTCDay();
  return kunQosh(d, -(w === 0 ? 6 : w - 1));
};

const tuples = (v: unknown[], n: number) =>
  Array.from({ length: v.length / n }, (_, i) => v.slice(i * n, i * n + n));

/**
 * A stand-in for the league tables that answers every league query by its
 * `/* marker *\/`. Bound values are read in the order the SQL binds them;
 * each case names that order.
 */
export function ligaBaza(boshlangich: Partial<LigaBazaHolati> = {}) {
  const h: LigaBazaHolati = {
    xonalar: [],
    kirishlar: [],
    darajalar: new Map(),
    kunlar: [],
    azolik: [],
    guruhNomlari: new Map(),
    guruhHaftalari: [],
    ismlar: new Map(),
    qulfBosh: true,
    chaqiruvlar: [],
    ...boshlangich,
  };
  // Testlar o'z qatorlariga kichik id beradi; soxta baza yaratganlari to'qnashmaydi.
  let keyingiId = 100_000;
  const ball = (sid: number, dan: string, gacha: string) =>
    h.kunlar
      .filter((k) => k.studentId === sid && k.day >= dan && k.day < gacha)
      .reduce((s, k) => s + k.points, 0);
  const hajm = (roomId: number) =>
    h.kirishlar.filter((k) => k.roomId === roomId).length;

  function javob(sql: Prisma.Sql): unknown[] | number {
    const m = /\/\* ([a-z-]+) \*\//.exec(sql.strings[0])?.[1] ?? '';
    h.chaqiruvlar.push(m);
    const v = sql.values as any[];
    switch (m) {
      case 'liga-qulf':
      case 'liga-qulf-umumiy':
      case 'liga-xona-qulf':
        return [{ ok: 1 }];
      case 'liga-qulf-sinash':
        return [{ ok: h.qulfBosh }];
      case 'liga-sharoiti': {
        // [studentId, hafta, studentId, companyId, hafta, studentId, GOLIB_MIN_BALL, GOLIB_MIN_AZO, studentId]
        const [sid, hafta, , companyId] = v;
        return [
          {
            tier: h.darajalar.get(sid) ?? 0,
            azo: h.kirishlar.some(
              (k) => k.weekStart === hafta && k.studentId === sid,
            ),
            kechikkan: h.xonalar.some(
              (x) =>
                x.companyId === companyId &&
                x.settledAt === null &&
                x.weekStart < hafta,
            ),
            xonaGolib: h.kirishlar.some(
              (k) =>
                k.studentId === sid &&
                k.place === 1 &&
                (k.points ?? 0) >= v[6] &&
                hajm(k.roomId) >= v[7],
            ),
            guruhBirinchi: h.kunlar.some(
              (k) =>
                k.studentId === sid &&
                k.points > 0 &&
                h.guruhHaftalari.some(
                  (g) =>
                    g.groupId === k.groupKey &&
                    g.weekStart === dushanba(k.day) &&
                    g.place === 1,
                ),
            ),
          },
        ];
      }
      case 'liga-daraja': // [studentId]
        return h.darajalar.has(v[0]) ? [{ tier: h.darajalar.get(v[0]) }] : [];
      case 'liga-kirish': // [hafta, studentId]
        return h.kirishlar
          .filter((k) => k.weekStart === v[0] && k.studentId === v[1])
          .map((k) => ({ roomId: k.roomId }));
      case 'liga-xonalar-hajmi': // [companyId, hafta, tier]
        return h.xonalar
          .filter(
            (x) =>
              x.companyId === v[0] && x.weekStart === v[1] && x.tier === v[2],
          )
          .map((x) => ({ id: x.id, number: x.number, hajm: hajm(x.id) }));
      case 'liga-xona-och': {
        // [companyId, hafta, tier, companyId, hafta, tier, soni]
        const [companyId, weekStart, tier] = v;
        const eng = Math.max(
          0,
          ...h.xonalar
            .filter(
              (x) =>
                x.companyId === companyId &&
                x.weekStart === weekStart &&
                x.tier === tier,
            )
            .map((x) => x.number),
        );
        return Array.from({ length: v[6] }, (_, i) => {
          const x: FakeXona = {
            id: keyingiId++,
            companyId,
            weekStart,
            tier,
            number: eng + i + 1,
            settledAt: null,
          };
          h.xonalar.push(x);
          return { id: x.id, number: x.number };
        });
      }
      case 'liga-azo-qosh': {
        // tuples (roomId, studentId, companyId, weekStart, tier); ON CONFLICT (weekStart, studentId) DO NOTHING
        let n = 0;
        for (const [roomId, studentId, companyId, weekStart, tier] of tuples(
          v,
          5,
        ) as any[]) {
          if (
            h.kirishlar.some(
              (k) => k.weekStart === weekStart && k.studentId === studentId,
            )
          )
            continue;
          h.kirishlar.push({
            id: keyingiId++,
            roomId,
            studentId,
            companyId,
            weekStart,
            tier,
            place: null,
            points: null,
            promoted: false,
          });
          n += 1;
        }
        return n;
      }
      case 'liga-holat': {
        // [studentId, studentId, hafta, otgan]
        const [sid, , hafta, otgan] = v;
        const tier = h.darajalar.get(sid) ?? 0;
        const ks = h.kirishlar.filter(
          (k) =>
            k.studentId === sid &&
            (k.weekStart === hafta || k.weekStart === otgan),
        );
        if (ks.length === 0)
          return [
            {
              tier,
              hafta: null,
              roomId: null,
              number: null,
              xonaDarajasi: null,
              place: null,
              promoted: null,
              hajm: 0,
            },
          ];
        return ks.map((k) => ({
          tier,
          hafta: k.weekStart,
          roomId: k.roomId,
          number: h.xonalar.find((x) => x.id === k.roomId)!.number,
          xonaDarajasi: k.tier,
          place: k.place,
          promoted: k.promoted,
          hajm: hajm(k.roomId),
        }));
      }
      case 'liga-xona': {
        // [hafta, keyingi, roomId]
        const [dan, gacha, roomId] = v;
        return h.kirishlar
          .filter((k) => k.roomId === roomId)
          .map((k) => {
            const [firstName, lastName] = h.ismlar.get(k.studentId) ?? [
              'Ism',
              String(k.studentId),
            ];
            return {
              studentId: k.studentId,
              firstName,
              lastName,
              points: ball(k.studentId, dan, gacha),
            };
          });
      }
      case 'liga-eng-eski': {
        // [companyId, joriy]
        const w =
          h.xonalar
            .filter(
              (x) =>
                x.companyId === v[0] &&
                x.settledAt === null &&
                x.weekStart < v[1],
            )
            .map((x) => x.weekStart)
            .sort()[0] ?? null;
        return [{ w }];
      }
      case 'liga-xonalarni-ol': {
        // [companyId, hafta]
        const ol = h.xonalar.filter(
          (x) =>
            x.companyId === v[0] &&
            x.weekStart === v[1] &&
            x.settledAt === null,
        );
        for (const x of ol) x.settledAt = new Date();
        return ol.map((x) => ({ id: x.id, tier: x.tier }));
      }
      case 'liga-azolar-ballari': {
        // [hafta, keyingi, roomIds]
        const [dan, gacha, ids] = v;
        return h.kirishlar
          .filter((k) => (ids as number[]).includes(k.roomId))
          .map((k) => ({
            id: k.id,
            roomId: k.roomId,
            studentId: k.studentId,
            points: ball(k.studentId, dan, gacha),
          }));
      }
      case 'liga-natija-yoz': {
        // tuples (id, place, points, promoted)
        for (const [id, place, points, promoted] of tuples(v, 4) as any[]) {
          Object.assign(h.kirishlar.find((k) => k.id === id)!, {
            place,
            points,
            promoted,
          });
        }
        return v.length / 4;
      }
      case 'liga-kotar': {
        // tuples (studentId, companyId, tier); DO UPDATE SET tier = GREATEST(old, new)
        for (const [sid, , tier] of tuples(v, 3) as any[]) {
          h.darajalar.set(sid, Math.max(h.darajalar.get(sid) ?? 0, tier));
        }
        return v.length / 3;
      }
      case 'liga-darajalar': // [studentIds]
        return (v[0] as number[])
          .filter((sid) => h.darajalar.has(sid))
          .map((sid) => ({ studentId: sid, tier: h.darajalar.get(sid) }));
      case 'liga-hafta-azolari': // [hafta, studentIds]
        return h.kirishlar
          .filter(
            (k) =>
              k.weekStart === v[0] && (v[1] as number[]).includes(k.studentId),
          )
          .map((k) => ({ studentId: k.studentId }));
      case 'guruhlar-yigindisi': {
        // [companyId, companyId, hafta, keyingi]
        const [, , dan, gacha] = v;
        const guruhlar = [...new Set(h.azolik.map((a) => a.groupId))];
        return guruhlar.map((g) => {
          const ids = [
            ...new Set(
              h.azolik.filter((a) => a.groupId === g).map((a) => a.studentId),
            ),
          ];
          return {
            groupId: g,
            name: h.guruhNomlari.get(g) ?? g,
            azolar: ids.length,
            ball: h.kunlar
              .filter(
                (k) =>
                  ids.includes(k.studentId) &&
                  k.groupKey === g &&
                  k.day >= dan &&
                  k.day < gacha,
              )
              .reduce((s, k) => s + k.points, 0),
          };
        });
      }
      case 'guruh-haftasi-yoz': {
        // tuples (companyId, weekStart, groupId, place, average, members, points); ON CONFLICT DO NOTHING
        let n = 0;
        for (const [
          companyId,
          weekStart,
          groupId,
          place,
          average,
          members,
          points,
        ] of tuples(v, 7) as any[]) {
          if (
            h.guruhHaftalari.some(
              (g) => g.weekStart === weekStart && g.groupId === groupId,
            )
          )
            continue;
          h.guruhHaftalari.push({
            companyId,
            weekStart,
            groupId,
            place,
            average,
            members,
            points,
          });
          n += 1;
        }
        return n;
      }
    }
    throw new Error(`liga soxta bazasi: tanilmagan so'rov "${m}"`);
  }

  const db: any = {
    $queryRaw: jest.fn((sql: Prisma.Sql) =>
      Promise.resolve().then(() => javob(sql) as unknown[]),
    ),
    $executeRaw: jest.fn((sql: Prisma.Sql) =>
      Promise.resolve().then(() => javob(sql) as number),
    ),
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      Promise.resolve().then(() => fn(db)),
    ),
  };
  return { db, h };
}

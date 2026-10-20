import type { Prisma } from '@prisma/client';
import {
  haftaTayyormi,
  haftalikAuditoriya,
  kechkiAuditoriya,
} from './eslatma-auditoriya';

// `any`: a jest.fn is not the overloaded `$queryRaw` type (specs are typechecked).
function db(qatorlar: unknown[] = []): any {
  return { $queryRaw: jest.fn(async (..._a: unknown[]) => qatorlar) };
}
const sqlOf = (m: jest.Mock) => m.mock.calls[0][0] as Prisma.Sql;

describe('eslatma auditoriyasi — bitta SQL', () => {
  it("kechki: bitta so'rov, qoida sanalari matn sifatida, 7 kunlik chegara qiymati", async () => {
    const d = db([
      { studentId: 10001, ism: 'Aziza', seriya: 3, dailyGoal: null },
    ]);
    expect(await kechkiAuditoriya(d, 1, '2026-10-21')).toHaveLength(1);
    expect(d.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = sqlOf(d.$queryRaw);
    const matn = sql.strings.join('?');
    expect(matn).toContain('/* eslatma-kechki */');
    expect(matn).toContain('"telegramDisconnectedAt" IS NULL');
    expect(matn).toContain('COALESCE(st."remindersEnabled", true)');
    expect(matn).toContain("r.status = 'SENT'");
    expect(sql.values).toEqual([
      '2026-10-21', // seriya: bugundan oldingi kunlar
      '2026-10-20', // seriya: kechadan boshlab
      1,
      '2026-10-07', // 14 kunlik oyna boshi
      '2026-10-21',
      '2026-10-21', // bugun qatori yo'q
      '2026-10-21', // bugun egallangan kechki
      '2026-10-20', // kecha SENT kechki
      '2026-10-21', // bugun SENT xulosa
      '2026-10-15', // 7 kunlik oyna boshi
      '2026-10-21',
      4,
    ]);
  });

  it("haftalik: o'tgan hafta [o'tgan dushanba, shu dushanba)", async () => {
    const d = db();
    await haftalikAuditoriya(d, 1, '2026-10-19');
    const sql = sqlOf(d.$queryRaw);
    expect(sql.strings.join('?')).toContain('/* eslatma-haftalik */');
    expect(sql.values).toEqual([
      1,
      '2026-10-12',
      '2026-10-19',
      '2026-10-19',
      '2026-10-12',
      '2026-10-19',
      1,
      '2026-10-12',
      '2026-10-12',
      '2026-10-19',
      '2026-10-12',
      '2026-10-12',
    ]);
  });

  it("tayyorlik: joriy haftadan oldingi hisoblanmagan xona yo'q", async () => {
    const ha = db([{ tayyor: true }]);
    expect(await haftaTayyormi(ha, 1, '2026-10-19')).toBe(true);
    expect(sqlOf(ha.$queryRaw).values).toEqual([1, '2026-10-19']);
    expect(await haftaTayyormi(db([{ tayyor: false }]), 1, '2026-10-19')).toBe(
      false,
    );
  });
});

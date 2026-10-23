import type { Prisma } from '@prisma/client';
import {
  eskilariniTozala,
  eslatmaniEgalla,
  natijaniYoz,
} from './eslatma-jurnali';

// `any`: a jest.fn is not the overloaded `$queryRaw` type (specs are typechecked).
function db(qatorlar: { id: number }[] = [{ id: 7 }]): any {
  return {
    $queryRaw: jest.fn(async (..._a: unknown[]) => qatorlar),
    $executeRaw: jest.fn(async (..._a: unknown[]) => 3),
  };
}
const sqlOf = (m: jest.Mock) => m.mock.calls[0][0] as Prisma.Sql;
const KALIT = {
  companyId: 1,
  studentId: 10001,
  kind: 'EVENING' as const,
  sentOn: '2026-10-20',
};

describe('eslatma jurnali — spec S4 §4', () => {
  it('yuborishdan oldin egallaydi: ON CONFLICT DO NOTHING RETURNING, FAILED bilan boshlanadi', async () => {
    const d = db();
    expect(await eslatmaniEgalla(d, KALIT)).toBe(7);
    const sql = sqlOf(d.$queryRaw);
    expect(sql.strings.join('?')).toMatch(
      /\/\* eslatma-egalla \*\/[\s\S]*INSERT INTO "DafReminderLog"[\s\S]*'FAILED'[\s\S]*ON CONFLICT \("studentId", "kind", "sentOn"\) DO NOTHING[\s\S]*RETURNING id/,
    );
    expect(sql.values).toEqual([1, 10001, 'EVENING', '2026-10-20']);
  });

  it('band qator (ikkinchi chaqiruv) — null', async () => {
    expect(await eslatmaniEgalla(db([]), KALIT)).toBeNull();
  });

  it('natija: faqat holat yangilanadi', async () => {
    const d = db();
    await natijaniYoz(d, 7, 'SENT');
    const sql = sqlOf(d.$executeRaw);
    expect(sql.strings.join('?')).toMatch(
      /UPDATE "DafReminderLog" SET "status" = \?::"DafReminderStatus" WHERE id = \?/,
    );
    expect(sql.values).toEqual(['SENT', 7]);
  });

  it("tozalash: 90 kundan eski qatorlar, kompaniya bo'yicha", async () => {
    const d = db();
    expect(await eskilariniTozala(d, 1, '2026-10-21')).toBe(3);
    const sql = sqlOf(d.$executeRaw);
    expect(sql.strings.join('?')).toMatch(
      /DELETE FROM "DafReminderLog"[\s\S]*"companyId" = \? AND "sentOn" < \?::date/,
    );
    expect(sql.values).toEqual([1, '2026-07-23']);
  });
});

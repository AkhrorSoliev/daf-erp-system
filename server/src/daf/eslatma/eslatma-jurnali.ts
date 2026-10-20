import { Prisma } from '@prisma/client';
import {
  tozalashChegarasi,
  type EslatmaHolati,
  type EslatmaTuri,
} from './eslatma-qoidalari';

type Db = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

export interface EgallashKaliti {
  companyId: number;
  studentId: number;
  kind: EslatmaTuri;
  /** Toshkent kuni `YYYY-MM-DD`. */
  sentOn: string;
}

/**
 * `DafReminderLog` ning YAGONA yozuvchisi (spec S4 §4, ADR-0117;
 * `eslatma-jurnali.single-source.spec.ts`). Qator yuborishdan OLDIN
 * egallanadi: qatorni yaratgan chaqiruv yuboradi, ikkinchisi (cronning ikki
 * nusxasi, qayta ishga tushirish) `null` oladi va hech narsa qilmaydi.
 * Egallangan qator `FAILED` bilan boshlanadi: jarayon yuborishdan oldin
 * yiqilsa, qator «yuborilmadi» bo'lib qoladi — qayta urinilmaydi va
 * chegaraga sanalmaydi.
 */
export async function eslatmaniEgalla(
  db: Db,
  k: EgallashKaliti,
): Promise<number | null> {
  const [q] = await db.$queryRaw<
    { id: number }[]
  >(Prisma.sql`/* eslatma-egalla */
    INSERT INTO "DafReminderLog" ("companyId", "studentId", "kind", "sentOn", "status")
    VALUES (${k.companyId}::int, ${k.studentId}::int, ${k.kind}::"DafReminderKind", ${k.sentOn}::date, 'FAILED')
    ON CONFLICT ("studentId", "kind", "sentOn") DO NOTHING
    RETURNING id`);
  return q?.id ?? null;
}

/** Egallangan qatorning holati (`SENT` | `FAILED`); faqat shu `id` yangilanadi. */
export async function natijaniYoz(
  db: Db,
  id: number,
  status: EslatmaHolati,
): Promise<void> {
  await db.$executeRaw(Prisma.sql`/* eslatma-natija */
    UPDATE "DafReminderLog" SET "status" = ${status}::"DafReminderStatus" WHERE id = ${id}`);
}

/** 90 kundan eski qatorlar (kechki cron oxirida, kompaniya bo'yicha — indeks bilan). */
export function eskilariniTozala(
  db: Db,
  companyId: number,
  bugun: string,
): Promise<number> {
  return db.$executeRaw(Prisma.sql`/* eslatma-tozala */
    DELETE FROM "DafReminderLog"
    WHERE "companyId" = ${companyId} AND "sentOn" < ${tozalashChegarasi(bugun)}::date`);
}

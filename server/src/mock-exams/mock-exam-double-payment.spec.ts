import { randomUUID } from 'crypto';
import { MockExamGatewayBillingService } from './mock-exam-gateway-billing.service';
import { PaymeMethodsService } from '../payment-gateways/payme/payme-methods.service';
import { ClickMethodsService } from '../payment-gateways/click/click-methods.service';
import { CANNOT_PERFORM } from '../payment-gateways/payme/payme-errors';
import { CLICK_ALREADY_PAID } from '../payment-gateways/click/click-errors';

/**
 * BITTA RO'YXAT — BITTA TO'LOV.
 *
 * REGRESSIYA: shlyuz to'lovni yakunlayotganda ishtirokchi allaqachon
 * to'laganmi, tekshirilmasdi. Natijada:
 *   - bir odam to'lov sahifasini ikki marta ochsa (yoki Payme'ni ham,
 *     Click'ni ham boshlasa), IKKALA to'lov ham o'tardi;
 *   - odam Payme'da to'lovni boshlagan paytda admin naqd qabul qilsa,
 *     Payme to'lovi baribir o'tardi;
 *   - ro'yxati o'chirilgan odamning boshlangan to'lovi ham o'tardi.
 * Tizimda esa bitta `paid = true` qolardi — ikkinchi pul hech qayerda
 * ko'rinmasdi.
 *
 * Servislar haqiqiy, faqat baza xotirada — shunda Payme/Click protokoli
 * boshidan oxirigacha o'tadi.
 */

const CO = 1001;
type Row = Record<string, any>;

function matches(row: Row, where: Row) {
  return Object.entries(where).every(([k, v]) =>
    v === null ? row[k] == null : row[k] === v,
  );
}

function setup() {
  const db = {
    participants: [] as Row[],
    exams: [{ id: 'exam-1', title: 'Mock A1', price: 40000 }] as Row[],
    mockTxns: [] as Row[],
  };
  const withExam = (p: Row) => {
    const exam = db.exams.find((e) => e.id === p.examId)!;
    return { ...p, exam: { title: exam.title, price: exam.price } };
  };
  const prisma: any = {
    // DaF o'quvchisi — publicId = Student.id
    student: {
      findFirst: jest.fn(async ({ where }) =>
        where.id === 10050 ? { id: 10050 } : null,
      ),
    },
    paymentIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    paymeTransaction: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    clickTransaction: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    mockExamParticipant: {
      findMany: jest.fn(async ({ where }) =>
        db.participants
          .filter((p) => p.publicId === where.publicId && !p.deletedAt)
          .map(withExam),
      ),
      findUnique: jest.fn(async ({ where }) => {
        const p = db.participants.find((x) => x.id === where.id);
        return p ? withExam(p) : null;
      }),
      update: jest.fn(async ({ where, data }) => {
        const p = db.participants.find((x) => x.id === where.id)!;
        Object.assign(p, data);
        return withExam(p);
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const hit = db.participants.filter((p) => matches(p, where));
        hit.forEach((p) => Object.assign(p, data));
        return { count: hit.length };
      }),
    },
    mockExamGatewayTransaction: {
      findUnique: jest.fn(async ({ where }) => {
        if (where.id) return db.mockTxns.find((t) => t.id === where.id) ?? null;
        const k = where.provider_externalId_companyId;
        return (
          db.mockTxns.find(
            (t) => t.provider === k.provider && t.externalId === k.externalId,
          ) ?? null
        );
      }),
      create: jest.fn(async ({ data }) => {
        const row = {
          id: randomUUID(),
          createdAt: new Date(),
          completedAt: null,
          cancelledAt: null,
          ...data,
        };
        db.mockTxns.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) =>
        Object.assign(db.mockTxns.find((t) => t.id === where.id)!, data),
      ),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const payments = {
    resolveStudentBranchId: jest.fn(),
    createFromExternal: jest.fn(),
    reverse: jest.fn(),
  };
  const events = { emit: jest.fn() };
  const gateway = new MockExamGatewayBillingService(prisma, events as any);
  const payme = new PaymeMethodsService(prisma, payments as any, gateway);
  const click = new ClickMethodsService(prisma, payments as any, gateway);

  db.participants.push({
    id: 'part-1',
    examId: 'exam-1',
    publicId: 10050,
    studentId: 10050,
    feeAmount: 30000,
    paid: false,
    paidAt: null,
    deletedAt: null,
    registeredAt: new Date(),
    telegramChatId: '777',
  });

  const paymeCreate = (id: string) =>
    payme.createTransaction(
      {
        id,
        time: Date.now(),
        amount: 30000 * 100,
        account: { student_id: '10050' },
      },
      CO,
      1,
    );
  const paymePerform = (id: string) =>
    payme.performTransaction({ id }, CO, 2) as Promise<any>;

  const clickPrepare = (clickTransId: number) =>
    click.prepare(
      {
        click_trans_id: clickTransId,
        click_paydoc_id: clickTransId + 100,
        merchant_trans_id: '10050',
        amount: 30000,
      } as any,
      CO,
    );
  const clickComplete = (clickTransId: number, prepareId: string) =>
    click.complete(
      {
        click_trans_id: clickTransId,
        merchant_trans_id: '10050',
        merchant_prepare_id: prepareId,
        amount: 30000,
        error: 0,
      } as any,
      CO,
    );

  const txnOf = (externalId: string) =>
    db.mockTxns.find((t) => t.externalId === externalId)!;

  return {
    db,
    events,
    payments,
    paymeCreate,
    paymePerform,
    clickPrepare,
    clickComplete,
    txnOf,
  };
}

describe("Mock to'lovi: bitta ro'yxat uchun faqat bitta to'lov", () => {
  it("Payme: ikkinchi parallel to'lov rad etiladi (Payme pulni qaytaradi)", async () => {
    const t = setup();
    await t.paymeCreate('pm-A');
    await t.paymeCreate('pm-B');

    const first = await t.paymePerform('pm-A');
    const second = await t.paymePerform('pm-B');

    expect(first.result.state).toBe(2);
    expect(second).toHaveProperty('error.code', CANNOT_PERFORM);
    expect(t.txnOf('pm-A').state).toBe(2);
    expect(t.txnOf('pm-B').state).toBe(-1);
    expect(t.events.emit).toHaveBeenCalledTimes(1);
  });

  it("Click: ikkinchi parallel to'lov 'allaqachon to'langan' bilan rad etiladi", async () => {
    const t = setup();
    const p1 = await t.clickPrepare(1);
    const p2 = await t.clickPrepare(2);

    const c1 = await t.clickComplete(1, p1.merchant_prepare_id!);
    const c2 = await t.clickComplete(2, p2.merchant_prepare_id!);

    expect(c1.error).toBe(0);
    expect(c2.error).toBe(CLICK_ALREADY_PAID);
    expect(t.txnOf('1').state).toBe(2);
    expect(t.txnOf('2').state).toBe(-1);
    expect(t.events.emit).toHaveBeenCalledTimes(1);
  });

  it("Payme: to'lov boshlangach admin naqd qabul qilsa, Payme to'lovi o'tmaydi", async () => {
    const t = setup();
    await t.paymeCreate('pm-C');
    // Admin shu oraliqda «To'lov qabul qilish» (naqd) ni bosdi.
    Object.assign(t.db.participants[0], { paid: true, paidAt: new Date() });

    const res = await t.paymePerform('pm-C');

    expect(res).toHaveProperty('error.code', CANNOT_PERFORM);
    expect(t.txnOf('pm-C').state).toBe(-1);
    expect(t.events.emit).not.toHaveBeenCalled();
  });

  it("Click: to'lov boshlangach ro'yxat o'chirilsa, to'lov o'tmaydi", async () => {
    const t = setup();
    const p = await t.clickPrepare(3);
    t.db.participants[0].deletedAt = new Date();

    const res = await t.clickComplete(3, p.merchant_prepare_id!);

    expect(res.error).toBe(CLICK_ALREADY_PAID);
    expect(t.txnOf('3').state).toBe(-1);
    expect(t.db.participants[0].paid).toBe(false);
  });

  it("muvaffaqiyatli to'lovning takroriy Perform so'rovi hamon muvaffaqiyatli", async () => {
    // Payme javobni olmay qolsa Perform'ni qayta yuboradi — bu ikkinchi
    // to'lov EMAS, o'sha to'lovning o'zi. Uni rad etish pulni qaytarib
    // yuborardi.
    const t = setup();
    await t.paymeCreate('pm-D');
    await t.paymePerform('pm-D');

    const retry = await t.paymePerform('pm-D');

    expect(retry.result.state).toBe(2);
    expect(t.events.emit).toHaveBeenCalledTimes(1);
  });

  it("mock to'lovi hech qachon o'quvchi balansiga yozilmaydi", async () => {
    const t = setup();
    await t.paymeCreate('pm-E');
    await t.paymePerform('pm-E');

    expect(t.payments.createFromExternal).not.toHaveBeenCalled();
    expect(t.db.participants[0].paid).toBe(true);
  });
});

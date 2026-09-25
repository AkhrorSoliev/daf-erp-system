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
    exams: [
      {
        id: 'exam-1',
        companyId: CO,
        title: 'Mock A1',
        price: 40000,
        status: 'REGISTRATION_OPEN',
        deletedAt: null,
      },
    ] as Row[],
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
      create: jest.fn(async ({ data }) => ({ id: 'pt-1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    clickTransaction: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    mockExamParticipant: {
      findMany: jest.fn(async ({ where }) =>
        db.participants
          .filter((p) => p.publicId === where.publicId && !p.deletedAt)
          .filter((p) => {
            if (!where.exam) return true;
            const exam = db.exams.find((e) => e.id === p.examId)!;
            if ('deletedAt' in where.exam && exam.deletedAt) return false;
            const allowed = where.exam.status?.in;
            return !allowed || allowed.includes(exam.status);
          })
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
      findMany: jest.fn(async () =>
        db.mockTxns.map((t) => ({
          ...t,
          mockParticipant: { publicId: 10050 },
        })),
      ),
    },
    // Haqiqiy bazadagi kabi kechikish — tranzaksiya ichidagi vaqt belgisi
    // chaqiruvchi oldindan olgan `Date.now()` dan farq qilsin.
    $transaction: jest.fn(async (fn: any) => {
      await new Promise((r) => setTimeout(r, 3));
      return fn(prisma);
    }),
  };
  const payments = {
    resolveStudentBranchId: jest.fn(),
    createFromExternal: jest.fn(),
    reverse: jest.fn(),
  };
  const events = { emit: jest.fn() };
  const history = { recordUpdate: jest.fn() };
  const gateway = new MockExamGatewayBillingService(
    prisma,
    events as any,
    history as any,
  );
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

  const paymeCheck = (accountId: string) =>
    payme.checkPerformTransaction(
      { amount: 30000 * 100, account: { student_id: accountId } },
      CO,
      3,
    ) as Promise<any>;

  return {
    db,
    prisma,
    payme,
    events,
    history,
    payments,
    paymeCheck,
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

  // Naqd to'lov tarixga yozilardi, onlayn to'lov esa izsiz qolardi.
  it("onlayn to'lov ishtirokchi tarixiga yoziladi", async () => {
    const t = setup();
    await t.paymeCreate('pm-H');
    await t.paymePerform('pm-H');

    expect(t.history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'MockExamParticipant',
        entityId: 'part-1',
        oldValues: { paid: false },
        newValues: expect.objectContaining({
          paid: true,
          paymentMethod: 'PAYME',
        }),
      }),
    );
  });

  it("mock to'lovi hech qachon o'quvchi balansiga yozilmaydi", async () => {
    const t = setup();
    await t.paymeCreate('pm-E');
    await t.paymePerform('pm-E');

    expect(t.payments.createFromExternal).not.toHaveBeenCalled();
    expect(t.db.participants[0].paid).toBe(true);
  });
});

/**
 * O'chirilgan yoki natijasi e'lon qilingan imtihonning to'lanmagan ro'yxati
 * to'lov manzili bo'lib qolardi: chatdagi eski tugma ishlar, DaF o'quvchisining
 * darsga qilgan aynan shu summadagi to'lovi esa o'sha eski mockka ketardi.
 */
describe("Mock to'lovi: faqat ochiq imtihon uchun", () => {
  const OUTSIDER = {
    id: 'part-out',
    examId: 'exam-1',
    publicId: 10900,
    studentId: null,
    feeAmount: 30000,
    paid: false,
    paidAt: null,
    deletedAt: null,
    registeredAt: new Date(),
    telegramChatId: '888',
  };

  it("o'chirilgan imtihonga tashqi odamning to'lovi qabul qilinmaydi", async () => {
    const t = setup();
    t.db.participants.push(OUTSIDER);
    t.db.exams[0].deletedAt = new Date();

    const res = await t.paymeCheck('10900');

    expect(res).toHaveProperty('error');
    expect(t.db.mockTxns).toHaveLength(0);
  });

  it("natijasi e'lon qilingan imtihonning eski ro'yxati DaF o'quvchisining to'lovini tortib olmaydi", async () => {
    const t = setup();
    t.db.exams[0].status = 'ANNOUNCED';

    await t.paymeCreate('pm-old');

    // Pul balansga (o'quvchi yo'li) ketdi, eski mock to'lanmagan qoldi.
    expect(t.prisma.paymeTransaction.create).toHaveBeenCalled();
    expect(t.db.mockTxns).toHaveLength(0);
    expect(t.db.participants[0].paid).toBe(false);
  });

  it("baholash davrida to'lov hali qabul qilinadi", async () => {
    const t = setup();
    t.db.exams[0].status = 'GRADING';

    await t.paymeCreate('pm-grading');

    expect(t.db.mockTxns).toHaveLength(1);
  });
});

/**
 * Payme bir tranzaksiya uchun har bir javobda bir xil vaqtni kutadi. Mock
 * yo'lida `create_time` uch xil qaytardi (yangi Create — server vaqti, takroriy
 * Create va CheckTransaction — Payme'ning `time`i, GetStatement — createdAt),
 * `perform_time` / `cancel_time` esa bazadagidan bir necha ms farq qilardi.
 */
describe("Mock to'lovi: Payme vaqtlari bir xil", () => {
  const params = (id: string) => ({
    id,
    time: Date.now() - 5000, // Payme'ning vaqti serverdan farq qiladi
    amount: 30000 * 100,
    account: { student_id: '10050' },
  });
  const wait = () => new Promise((r) => setTimeout(r, 5));

  it('create_time Create, takroriy Create, Check va Statement da bir xil', async () => {
    const t = setup();
    const created: any = await t.payme.createTransaction(params('pm-T'), CO, 1);
    await wait();
    const retried: any = await t.payme.createTransaction(params('pm-T'), CO, 2);
    const checked: any = await t.payme.checkTransaction({ id: 'pm-T' }, CO, 3);
    const stmt: any = await t.payme.getStatement(
      { from: 0, to: Date.now() + 60_000 },
      CO,
      4,
    );

    const c = created.result.create_time;
    expect(retried.result.create_time).toBe(c);
    expect(checked.result.create_time).toBe(c);
    expect(stmt.result.transactions[0].create_time).toBe(c);
  });

  it('perform_time Perform va Check da bir xil', async () => {
    const t = setup();
    await t.payme.createTransaction(params('pm-P'), CO, 1);
    const performed: any = await t.payme.performTransaction(
      { id: 'pm-P' },
      CO,
      2,
    );
    await wait();
    const checked: any = await t.payme.checkTransaction({ id: 'pm-P' }, CO, 3);

    expect(checked.result.perform_time).toBe(performed.result.perform_time);
  });

  it('cancel_time Cancel va Check da bir xil', async () => {
    const t = setup();
    await t.payme.createTransaction(params('pm-C2'), CO, 1);
    const cancelled: any = await t.payme.cancelTransaction(
      { id: 'pm-C2', reason: 3 },
      CO,
      2,
    );
    await wait();
    const checked: any = await t.payme.checkTransaction({ id: 'pm-C2' }, CO, 3);

    expect(checked.result.cancel_time).toBe(cancelled.result.cancel_time);
  });
});

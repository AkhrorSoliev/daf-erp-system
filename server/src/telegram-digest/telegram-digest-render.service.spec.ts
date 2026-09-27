import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentMethod,
  Prisma,
  TelegramDigestCategory,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  RenderedDigest,
  TelegramDigestRenderService,
} from './telegram-digest-render.service';
import {
  DigestPayloadByCategory,
  MonthlyChargeDigestPayload,
  TelegramDigestItemRow,
} from './telegram-digest-payloads';

let seq = 0;
function row<C extends TelegramDigestCategory>(
  category: C,
  payload: DigestPayloadByCategory[C],
  opts: {
    relatedEntityId?: string | null;
    at?: string;
    companyId?: number;
  } = {},
): TelegramDigestItemRow {
  seq += 1;
  return {
    id: `row-${seq}`,
    companyId: opts.companyId ?? 1001,
    branchId: null,
    category,
    relatedEntityId: opts.relatedEntityId ?? null,
    payload: payload as unknown as Prisma.JsonValue,
    createdAt: new Date(opts.at ?? '2026-09-23T10:00:00Z'),
  };
}

/** All block text as one string, with formatSum's U+00A0 made a plain space. */
const textOf = (r: RenderedDigest) =>
  r.blocks
    .map((b) => b.text)
    .join('\n')
    .replace(/\u00A0/g, ' ');

const allIds = (r: RenderedDigest) => [
  ...r.blocks.flatMap((b) => b.itemIds),
  ...r.hiddenIds,
];

describe('TelegramDigestRenderService', () => {
  let service: TelegramDigestRenderService;
  let studentFindUnique: jest.Mock;
  let transactionFindMany: jest.Mock;
  let chargeFindMany: jest.Mock;
  let enrollmentFindMany: jest.Mock;

  beforeEach(async () => {
    studentFindUnique = jest.fn();
    transactionFindMany = jest.fn().mockResolvedValue([]);
    chargeFindMany = jest.fn().mockResolvedValue([]);
    enrollmentFindMany = jest.fn().mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDigestRenderService,
        {
          provide: PrismaService,
          useValue: {
            student: { findUnique: studentFindUnique },
            transaction: { findMany: transactionFindMany },
            enrollmentMonthlyCharge: { findMany: chargeFindMany },
            enrollment: { findMany: enrollmentFindMany },
          },
        },
      ],
    }).compile();
    service = module.get(TelegramDigestRenderService);
  });

  const receipt = (paymentId: string, amount: number, method: PaymentMethod) =>
    row(
      TelegramDigestCategory.PAYMENT_RECEIVED,
      {
        paymentId,
        amount,
        method,
        receiptUrl: `https://invoice.dafzentrum.uz/${paymentId}`,
        performedById: 99,
      },
      { relatedEntityId: paymentId },
    );

  const debt = (attendanceId: string, perLessonCost = 20000) =>
    row(
      TelegramDigestCategory.DEBT_CHARGE,
      { attendanceId, groupName: 'A1-01', perLessonCost, date: '2026-09-23' },
      { relatedEntityId: attendanceId },
    );

  describe('renderStudent', () => {
    it('returns nothing for no rows', async () => {
      const r = await service.renderStudent(10042, []);
      expect(r).toEqual({ blocks: [], audit: [], hiddenIds: [] });
    });

    it('renders a receipt with method label, receipt link, live balance and one audit entry', async () => {
      studentFindUnique.mockResolvedValue({
        firstName: 'Aziz',
        balance: 2000000,
      });
      const items = [receipt('pay-1', 1500000, PaymentMethod.TRANSFER)];

      const r = await service.renderStudent(10042, items);
      const text = textOf(r);

      expect(text).toContain('Hurmatli Aziz!');
      expect(text).toContain("💳 <b>To'lovlar</b>");
      expect(text).toContain(
        "<b>1 500 000 so'm</b> to'lovingiz qabul qilindi (Bank o'tkazmasi)",
      );
      expect(text).toContain(
        '📄 Kvitansiya: https://invoice.dafzentrum.uz/pay-1',
      );
      expect(text).toContain("Joriy balansingiz: <b>2 000 000 so'm</b>");
      expect(text.endsWith('Rahmat!')).toBe(true);
      expect(r.audit).toEqual([
        expect.objectContaining({
          itemId: items[0].id,
          senderUserId: 99,
          companyId: 1001,
        }),
      ]);
      expect(r.audit[0].content).toContain('Kvitansiya');
    });

    it('shows the reversal reason, escaped', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: 0 });
      const r = await service.renderStudent(10042, [
        row(
          TelegramDigestCategory.PAYMENT_REVERSED,
          {
            paymentId: 'pay-1',
            amount: 5000000,
            reason: 'Summa <ortiqcha> & xato',
            performedById: null,
          },
          { relatedEntityId: 'pay-1' },
        ),
      ]);
      const text = textOf(r);
      expect(text).toContain("<b>5 000 000 so'm</b> to'lovingiz bekor qilindi");
      expect(text).toContain('Sabab: Summa &lt;ortiqcha&gt; &amp; xato');
      expect(text).toContain("Savollar bo'lsa, markazga murojaat qiling.");
      expect(text).not.toContain('Rahmat!');
      expect(r.audit[0].senderUserId).toBeNull();
    });

    it('renders enrollment and removal notices with escaped group names', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: 0 });
      const r = await service.renderStudent(10042, [
        row(TelegramDigestCategory.STUDENT_ENROLLED, {
          groupName: 'A1 & <B>',
          courseName: 'Standard Deutsch',
          days: null,
          exactDays: ['monday', 'wednesday'],
          lessonStartTime: '09:00',
          lessonEndTime: '10:30',
        }),
        row(TelegramDigestCategory.STUDENT_REMOVED, {
          groupName: 'B1-2',
          reason: "To'lov qilmagan",
        }),
      ]);
      const text = textOf(r);
      expect(text).toContain('📚 <b>Guruh</b>');
      expect(text).toContain('<b>A1 &amp; &lt;B&gt;</b>');
      expect(text).toContain('Dushanba, Chorshanba');
      expect(text).toContain('Guruhdan chiqarildingiz');
      expect(text).toContain("Sabab: To'lov qilmagan");
      expect(text).toContain(
        'Muvaffaqiyat tilaymiz!\n\n❌ <b>Guruhdan chiqarildingiz</b>',
      );
      expect(text).not.toContain('Joriy balansingiz'); // no money moved
      expect(r.audit).toHaveLength(2);
    });

    it('shows a live debt with price, current debt, top-up request and portal link', async () => {
      studentFindUnique.mockResolvedValue({
        firstName: 'Aziz',
        balance: -20000,
      });
      transactionFindMany.mockResolvedValue([{ attendanceId: 'att-1' }]);

      const r = await service.renderStudent(10042, [debt('att-1')]);
      const text = textOf(r);

      expect(text).toContain('⚠️ <b>Qarzga yozilgan darslar</b>');
      expect(text).toContain("• A1-01 (23.09.2026) — 20 000 so'm");
      expect(text).toContain("Hozirgi qarz: <b>20 000 so'm</b>");
      expect(text).toContain("Iltimos, balansingizni to'ldiring.");
      expect(text).toContain('🔗 Profilingiz: https://student.dafzentrum.uz');
      expect(transactionFindMany).toHaveBeenCalledWith({
        where: {
          studentId: 10042,
          attendanceId: { in: ['att-1'] },
          type: TransactionType.LESSON_DEDUCTION,
          reversedAt: null,
          metadata: { path: ['mode'], equals: 'SINGLE_UNCOVERED' },
        },
        select: { attendanceId: true },
      });
    });

    it('omits the price when the lesson price is 0', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: -1 });
      transactionFindMany.mockResolvedValue([{ attendanceId: 'att-1' }]);
      const text = textOf(
        await service.renderStudent(10042, [debt('att-1', 0)]),
      );
      expect(text).toContain('• A1-01 (23.09.2026)');
      expect(text).not.toContain("— 0 so'm");
    });

    it('hides the debt section once the balance is back to non-negative', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: 0 });
      transactionFindMany.mockResolvedValue([{ attendanceId: 'att-1' }]);
      const items = [debt('att-1')];

      const r = await service.renderStudent(10042, items);

      expect(r.blocks).toEqual([]);
      expect(r.hiddenIds).toEqual([items[0].id]);
    });

    it('hides a charge that was reversed before 20:00 even while in debt', async () => {
      studentFindUnique.mockResolvedValue({
        firstName: 'Aziz',
        balance: -50000,
      });
      transactionFindMany.mockResolvedValue([]); // deduction since reversed
      const items = [
        debt('att-1'),
        receipt('pay-1', 100000, PaymentMethod.CASH),
      ];

      const r = await service.renderStudent(10042, items);
      const text = textOf(r);

      expect(text).not.toContain('Qarzga yozilgan darslar');
      expect(text).toContain("Joriy balansingiz: <b>-50 000 so'm</b>");
      expect(r.hiddenIds).toEqual([items[0].id]);
    });

    it('merges repeated rows of one attendance into one line carrying both ids', async () => {
      studentFindUnique.mockResolvedValue({
        firstName: 'Aziz',
        balance: -20000,
      });
      transactionFindMany.mockResolvedValue([{ attendanceId: 'att-1' }]);
      const first = debt('att-1');
      const second = debt('att-1');

      const r = await service.renderStudent(10042, [first, second]);

      expect(textOf(r).match(/A1-01/g)).toHaveLength(1);
      expect(allIds(r).sort()).toEqual([first.id, second.id].sort());
      expect(r.audit).toHaveLength(1);
    });

    it('hides everything when the student row is gone', async () => {
      studentFindUnique.mockResolvedValue(null);
      const items = [receipt('pay-1', 100000, PaymentMethod.CASH)];
      const r = await service.renderStudent(10042, items);
      expect(r.blocks).toEqual([]);
      expect(r.hiddenIds).toEqual([items[0].id]);
    });

    it('accounts for every row it was given', async () => {
      studentFindUnique.mockResolvedValue({
        firstName: 'Aziz',
        balance: -20000,
      });
      transactionFindMany.mockResolvedValue([{ attendanceId: 'att-1' }]);
      const items = [
        receipt('pay-1', 100000, PaymentMethod.CASH),
        debt('att-1'),
        debt('att-2'),
        row(TelegramDigestCategory.STUDENT_REMOVED, {
          groupName: 'B1',
          reason: 'x',
        }),
      ];
      const r = await service.renderStudent(10042, items);
      expect(allIds(r).sort()).toEqual(items.map((i) => i.id).sort());
    });
  });

  describe('renderUser', () => {
    const NOW = new Date('2026-09-23T15:00:00Z'); // 20:00 Tashkent

    it('returns nothing for no rows', () => {
      expect(service.renderUser([], NOW)).toEqual({
        blocks: [],
        audit: [],
        hiddenIds: [],
      });
    });

    it('lists attendance per group, omits zero counts, dates past days', () => {
      const text = textOf(
        service.renderUser(
          [
            row(TelegramDigestCategory.ATTENDANCE_COMPLETED, {
              groupId: 'g1',
              groupName: 'A1-01',
              date: '2026-09-23',
              present: 8,
              absent: 0,
              late: 1,
              excused: 0,
            }),
            row(TelegramDigestCategory.ATTENDANCE_COMPLETED, {
              groupId: 'g2',
              groupName: 'B1-02',
              date: '2026-09-22',
              present: 0,
              absent: 3,
              late: 0,
              excused: 0,
            }),
          ],
          NOW,
        ),
      );
      expect(text).toContain('✅ <b>Davomat qabul qilindi</b>');
      expect(text).toContain('• A1-01 — Keldi: 8 / Kechikdi: 1');
      expect(text).toContain('• B1-02 (22.09.2026) — Kelmadi: 3');
      expect(text).not.toContain('Keldi: 0');
    });

    it('renders every task kind and escapes free text', () => {
      const text = textOf(
        service.renderUser(
          [
            row(
              TelegramDigestCategory.TASK_ASSIGNED,
              { authorName: 'CEO', content: 'Hisobot <tez>' },
              { relatedEntityId: 'c1' },
            ),
            row(
              TelegramDigestCategory.TASK_UPDATED,
              { authorName: 'CEO', content: 'Yangi matn' },
              { relatedEntityId: 'c2' },
            ),
            row(
              TelegramDigestCategory.TASK_DELETED,
              { authorName: 'CEO', content: 'Eski' },
              { relatedEntityId: 'c3' },
            ),
            row(
              TelegramDigestCategory.TASK_STATUS_CHANGED,
              {
                assigneeName: 'Ali Valiyev',
                status: 'DONE',
                content: 'Hisobot',
              },
              { relatedEntityId: 'c1:20001' },
            ),
            row(
              TelegramDigestCategory.TASK_STATUS_CHANGED,
              {
                assigneeName: 'Vali Aliyev',
                status: 'SEEN',
                content: 'Hisobot',
              },
              { relatedEntityId: 'c1:20002' },
            ),
          ],
          NOW,
        ),
      );
      expect(text).toContain('📝 <b>Topshiriqlar</b>');
      expect(text).toContain(
        '• CEO sizga topshiriq berdi: "Hisobot &lt;tez&gt;"',
      );
      expect(text).toContain('• CEO topshiriqni yangiladi: "Yangi matn"');
      expect(text).toContain(`• CEO topshiriqni o'chirdi: "Eski"`);
      expect(text).toContain('• Ali Valiyev topshiriqni bajardi: "Hisobot"');
      expect(text).toContain(`• Vali Aliyev topshiriqni ko'rdi: "Hisobot"`);
    });

    it('shows only the latest update of the same task', () => {
      const r = service.renderUser(
        [
          row(
            TelegramDigestCategory.TASK_UPDATED,
            { authorName: 'CEO', content: 'birinchi' },
            { relatedEntityId: 'c1', at: '2026-09-23T04:00:00Z' },
          ),
          row(
            TelegramDigestCategory.TASK_UPDATED,
            { authorName: 'CEO', content: 'oxirgi' },
            { relatedEntityId: 'c1', at: '2026-09-23T06:00:00Z' },
          ),
        ],
        NOW,
      );
      expect(textOf(r)).toContain('oxirgi');
      expect(textOf(r)).not.toContain('birinchi');
      expect(allIds(r)).toHaveLength(2);
    });

    it('sums carried-over salary rows into one line', () => {
      const text = textOf(
        service.renderUser(
          [
            row(TelegramDigestCategory.SALARY_CARRIED_OVER, {
              count: 2,
              total: 40000,
            }),
            row(TelegramDigestCategory.SALARY_CARRIED_OVER, {
              count: 1,
              total: 25000,
            }),
          ],
          NOW,
        ),
      );
      expect(text).toContain('💵 <b>Oylik</b>');
      expect(text).toContain(
        "oldingi oydagi 3 ta dars uchun <b>65 000 so'm</b> joriy oyligingizga qo'shildi.",
      );
    });

    it("renders a payment correction exactly like today's CEO alert", () => {
      const text = textOf(
        service.renderUser(
          [
            row(TelegramDigestCategory.PAYMENT_CORRECTED, {
              performerName: 'Admin User',
              studentName: 'Ali Valiyev',
              studentId: 10001,
              oldAmount: 5000000,
              newAmount: 400000,
              oldMethod: PaymentMethod.CASH,
              newMethod: PaymentMethod.TRANSFER,
              reason: 'Ortiqcha nol kiritilgan',
            }),
          ],
          NOW,
        ),
      );
      expect(text).toContain("✏️ <b>To'g'irlangan to'lovlar</b>");
      expect(text).toContain(
        "• Admin User Ali Valiyevning to'lovini to'g'riladi: 5 000 000 → 400 000 so'm, Naqd → Bank o'tkazmasi. Sabab: Ortiqcha nol kiritilgan",
      );
    });

    it('orders sections: attendance, tasks, salary, corrections', () => {
      const text = textOf(
        service.renderUser(
          [
            row(TelegramDigestCategory.PAYMENT_CORRECTED, {
              performerName: 'A',
              studentName: 'B',
              studentId: 1,
              oldAmount: 1,
              newAmount: 2,
              oldMethod: PaymentMethod.CASH,
              newMethod: PaymentMethod.CASH,
              reason: 'r',
            }),
            row(TelegramDigestCategory.SALARY_CARRIED_OVER, {
              count: 1,
              total: 1,
            }),
            row(
              TelegramDigestCategory.TASK_ASSIGNED,
              { authorName: 'A', content: 'c' },
              { relatedEntityId: 'c9' },
            ),
            row(TelegramDigestCategory.ATTENDANCE_COMPLETED, {
              groupId: 'g',
              groupName: 'G',
              date: '2026-09-23',
              present: 1,
              absent: 0,
              late: 0,
              excused: 0,
            }),
          ],
          NOW,
        ),
      );
      const order = ['Davomat', 'Topshiriqlar', 'Oylik', "To'g'irlangan"].map(
        (h) => text.indexOf(h),
      );
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(order.every((i) => i >= 0)).toBe(true);
    });
  });
  describe('monthly bill and reminder (ADR-0042)', () => {
    /** 20:00 Tashkent, 01.10.2026. */
    const OCT_1 = new Date('2026-10-01T15:00:00Z');
    /** 20:00 Tashkent, 04.10.2026 — the eve of the 2nd lesson. */
    const OCT_4 = new Date('2026-10-04T15:00:00Z');

    const bill = (over: Partial<MonthlyChargeDigestPayload> = {}) =>
      row(
        TelegramDigestCategory.MONTHLY_CHARGE,
        {
          chargeId: 'charge-1',
          groupName: 'A1-12',
          daysLabel: 'Du, Cho, Ju',
          periodYear: 2026,
          periodMonth: 10,
          price: 1040000,
          coveredLessons: 13,
          creditLessons: 0,
          creditAmount: 0,
          chargedAmount: 1040000,
          dueDate: '2026-10-05',
          ...over,
        },
        { relatedEntityId: over.chargeId ?? 'charge-1' },
      );
    const reminder = (lessonDate: string) =>
      row(
        TelegramDigestCategory.PAYMENT_REMINDER,
        {
          enrollmentId: 'enr-1',
          groupName: 'A1-12',
          periodYear: 2026,
          periodMonth: 10,
          lessonDate,
        },
        { relatedEntityId: `enr-1:${lessonDate}` },
      );
    const student = (balance: number) =>
      studentFindUnique.mockResolvedValue({ firstName: 'Ali', balance });
    const chargeStands = () =>
      chargeFindMany.mockResolvedValue([{ id: 'charge-1' }]);
    const enrollmentOpen = () =>
      enrollmentFindMany.mockResolvedValue([{ id: 'enr-1' }]);

    it('sends the approved bill to a student who owes', async () => {
      student(-1040000);
      chargeStands();
      const r = await service.renderStudent(10042, [bill()], OCT_1);
      expect(textOf(r)).toBe(
        [
          'Hurmatli Ali!',
          '',
          "📅 <b>Oktabr oyi uchun to'lov</b>",
          'Guruh: A1-12 (Du, Cho, Ju)',
          "Oylik narx: 1 040 000 so'm (13 dars)",
          "Jami to'lash kerak: <b>1 040 000 so'm</b>",
          'Muddat: <b>05.10.2026</b> — oyning 2-darsigacha',
          '',
          "To'lov: markazda, Payme yoki Click orqali.",
          '🔗 Profilingiz: https://student.dafzentrum.uz',
        ].join('\n'),
      );
      expect(r.audit).toHaveLength(1);
      expect(chargeFindMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['charge-1'] },
          status: 'CHARGED',
          enrollment: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
    });

    it('sends the settled variant when the balance covers the month', async () => {
      student(160000);
      chargeStands();
      const r = await service.renderStudent(10042, [bill()], OCT_1);
      expect(textOf(r)).toBe(
        [
          'Hurmatli Ali!',
          '',
          "📅 <b>Oktabr oyi uchun to'lov</b>",
          'Guruh: A1-12 (Du, Cho, Ju)',
          "Oylik narx 1 040 000 so'm balansingizdan yechildi.",
          "Qolgan balans: <b>160 000 so'm</b>",
          "Oktabr uchun to'lov qilish shart emas.",
          '',
          'Rahmat!',
        ].join('\n'),
      );
    });

    it('sends no bill for a charge reversed (or a student gone) since it was queued', async () => {
      student(-1040000);
      const queued = bill();
      const r = await service.renderStudent(10042, [queued], OCT_1);
      expect(r.blocks).toEqual([]);
      expect(r.hiddenIds).toEqual([queued.id]);
    });

    it('sends the approved reminder on the eve of the 2nd lesson', async () => {
      student(-1040000);
      enrollmentOpen();
      const r = await service.renderStudent(
        10042,
        [reminder('2026-10-05')],
        OCT_4,
      );
      expect(textOf(r)).toBe(
        [
          'Hurmatli Ali!',
          '',
          "⏰ <b>To'lov eslatmasi</b>",
          "Ertaga (05.10.2026) oktabrning 2-darsi bo'ladi.",
          "To'lash kerak: <b>1 040 000 so'm</b>",
          '',
          "Shartnomaga ko'ra oylik to'lov 2-darsgacha qilinadi. Darslaringiz uzilib qolmasligi uchun to'lovni ertagi darsgacha amalga oshirishingizni so'raymiz.",
          '',
          "To'lov: markazda, Payme yoki Click orqali.",
          "Savollar bo'lsa, markaz administratoriga murojaat qiling.",
          '🔗 Profilingiz: https://student.dafzentrum.uz',
        ].join('\n'),
      );
    });

    it('sends no reminder to a student who paid during the day', async () => {
      student(0);
      const queued = reminder('2026-10-05');
      const r = await service.renderStudent(10042, [queued], OCT_4);
      expect(r.blocks).toEqual([]);
      expect(r.hiddenIds).toEqual([queued.id]);
      expect(enrollmentFindMany).not.toHaveBeenCalled();
    });

    it('drops a reminder kept from an earlier run — «Ertaga» would name a past day', async () => {
      student(-1040000);
      enrollmentOpen();
      const stale = reminder('2026-10-04');
      const r = await service.renderStudent(10042, [stale], OCT_4);
      expect(r.blocks).toEqual([]);
      expect(r.hiddenIds).toEqual([stale.id]);
    });

    it('puts bill and reminder in one message with one closing when lessons 1 and 2 are on consecutive days', async () => {
      student(-1040000);
      chargeStands();
      enrollmentOpen();
      const r = await service.renderStudent(
        10042,
        [bill({ dueDate: '2026-10-02' }), reminder('2026-10-02')],
        OCT_1,
      );
      const text = textOf(r);
      expect(text.indexOf('Oktabr oyi uchun')).toBeLessThan(
        text.indexOf("To'lov eslatmasi"),
      );
      expect(text.match(/To'lov: markazda/g)).toHaveLength(1);
      expect(text).toContain(
        "Savollar bo'lsa, markaz administratoriga murojaat qiling.",
      );
    });

    it('drops the standalone balance line when a bill states it', async () => {
      student(160000);
      chargeStands();
      const r = await service.renderStudent(
        10042,
        [receipt('pay-1', 1200000, PaymentMethod.CASH), bill()],
        OCT_1,
      );
      const text = textOf(r);
      expect(text).not.toContain('Joriy balansingiz');
      expect(text).toContain("Qolgan balans: <b>160 000 so'm</b>");
      expect(text.match(/Rahmat!/g)).toHaveLength(1);
    });
  });
});

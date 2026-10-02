import { Prisma, TelegramDigestCategory } from '@prisma/client';
import { DedupedRow } from './telegram-digest-dedup';
import {
  MonthlyChargeDigestPayload,
  PaymentReminderDigestPayload,
} from './telegram-digest-payloads';
import { DigestBlock } from './telegram-message-parts';
import {
  EventBlockFn,
  monthlyBillSection,
  monthlyPaymentClosing,
  paymentReminderSection,
} from './monthly-payment-text';

let seq = 0;
function entry(category: TelegramDigestCategory, payload: unknown): DedupedRow {
  seq += 1;
  const id = `row-${seq}`;
  return {
    row: {
      id,
      companyId: 1001,
      branchId: null,
      category,
      relatedEntityId: id,
      payload: payload as Prisma.JsonValue,
      createdAt: new Date('2026-10-01T10:00:00Z'),
    },
    ids: [id],
  };
}

const bill = (over: Partial<MonthlyChargeDigestPayload> = {}) =>
  entry(TelegramDigestCategory.MONTHLY_CHARGE, {
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
  } satisfies MonthlyChargeDigestPayload);

const reminder = (over: Partial<PaymentReminderDigestPayload> = {}) =>
  entry(TelegramDigestCategory.PAYMENT_REMINDER, {
    enrollmentId: 'enr-1',
    groupName: 'A1-12',
    periodYear: 2026,
    periodMonth: 10,
    lessonDate: '2026-10-05',
    ...over,
  } satisfies PaymentReminderDigestPayload);

const event: EventBlockFn = (e, text) => ({ text, itemIds: e.ids });
const textOf = (blocks: DigestBlock[]) =>
  blocks
    .map((b) => b.text)
    .join('\n')
    .replace(/\u00A0/g, ' ');

describe('monthlyBillSection', () => {
  it('writes the approved bill for one group', () => {
    const blocks = monthlyBillSection([bill()], -1040000, '2026-10-01', event);
    expect(textOf(blocks)).toBe(
      [
        "📅 <b>Oktabr oyi uchun to'lov</b>",
        'Guruh: A1-12 (Du, Cho, Ju)',
        "Oylik narx: 1 040 000 so'm (13 dars)",
        "Jami to'lash kerak: <b>1 040 000 so'm</b>",
        'Muddat: <b>05.10.2026</b> — oyning 2-darsigacha',
      ].join('\n'),
    );
  });

  it('shows the excused-lesson credit of the previous month', () => {
    const blocks = monthlyBillSection(
      [bill({ creditLessons: 2, creditAmount: 160000, chargedAmount: 880000 })],
      -880000,
      '2026-10-01',
      event,
    );
    expect(textOf(blocks)).toContain(
      [
        "Oylik narx: 1 040 000 so'm (13 dars)",
        "Sentabrdagi 2 ta sababli dars uchun chegirma: −160 000 so'm",
        "Chegirma bilan oktabr uchun: 880 000 so'm",
        "Jami to'lash kerak: <b>880 000 so'm</b>",
      ].join('\n'),
    );
  });

  it('names the older debt apart from this month', () => {
    const blocks = monthlyBillSection([bill()], -1190000, '2026-10-01', event);
    expect(textOf(blocks)).toContain(
      [
        "Sentabrdan qolgan qarz: 150 000 so'm",
        "Jami to'lash kerak: <b>1 190 000 so'm</b>",
      ].join('\n'),
    );
  });

  it('writes the approved settled variant when the balance covers the month', () => {
    const blocks = monthlyBillSection([bill()], 160000, '2026-10-01', event);
    expect(textOf(blocks)).toBe(
      [
        "📅 <b>Oktabr oyi uchun to'lov</b>",
        'Guruh: A1-12 (Du, Cho, Ju)',
        "Oylik narx 1 040 000 so'm balansingizdan yechildi.",
        "Qolgan balans: <b>160 000 so'm</b>",
        "Oktabr uchun to'lov qilish shart emas.",
      ].join('\n'),
    );
  });

  it('lists two groups under one header, blank lines between, earliest due date', () => {
    const blocks = monthlyBillSection(
      [
        bill({
          chargeId: 'charge-2',
          groupName: 'B1-3',
          daysLabel: 'Se, Pa, Sha',
          price: 860000,
          chargedAmount: 860000,
          coveredLessons: 12,
          dueDate: '2026-10-03',
        }),
        bill(),
      ],
      -1900000,
      '2026-10-01',
      event,
    );
    expect(textOf(blocks)).toBe(
      [
        "📅 <b>Oktabr oyi uchun to'lov</b>",
        'Guruh: A1-12 (Du, Cho, Ju)',
        "Oylik narx: 1 040 000 so'm (13 dars)",
        '',
        'Guruh: B1-3 (Se, Pa, Sha)',
        "Oylik narx: 860 000 so'm (12 dars)",
        '',
        "Jami to'lash kerak: <b>1 900 000 so'm</b>",
        'Muddat: <b>03.10.2026</b> — oyning 2-darsigacha',
      ].join('\n'),
    );
  });

  it('drops the due line when the 2nd lesson is past or unknown', () => {
    expect(
      textOf(monthlyBillSection([bill()], -1040000, '2026-10-06', event)),
    ).not.toContain('Muddat');
    expect(
      textOf(
        monthlyBillSection(
          [bill({ dueDate: null })],
          -1040000,
          '2026-10-01',
          event,
        ),
      ),
    ).not.toContain('Muddat');
  });

  it('escapes the group name and omits empty days', () => {
    const blocks = monthlyBillSection(
      [bill({ groupName: 'A1 <Intensiv>', daysLabel: '' })],
      -1040000,
      '2026-10-01',
      event,
    );
    expect(textOf(blocks)).toContain('Guruh: A1 &lt;Intensiv&gt;\n');
  });

  it('makes each group one event block, the totals in the last one (the SMS record shows what was asked)', () => {
    const one = bill();
    const blocks = monthlyBillSection([one], -1040000, '2026-10-01', event);
    const events = blocks.filter((b) => b.itemIds.length > 0);
    expect(events).toHaveLength(1);
    expect(events[0].itemIds).toEqual(one.ids);
    expect(events[0].text).toContain('Guruh: A1-12');
    expect(events[0].text).toContain("Jami to'lash kerak");
  });
});

describe('paymentReminderSection', () => {
  it('writes the approved reminder', () => {
    const blocks = paymentReminderSection([reminder()], 1040000, event);
    expect(textOf(blocks)).toBe(
      [
        "⏰ <b>To'lov eslatmasi</b>",
        "Ertaga (05.10.2026) oktabrning 2-darsi bo'ladi.",
        "To'lash kerak: <b>1 040 000 so'm</b>",
        '',
        "Shartnomaga ko'ra oylik to'lov 2-darsgacha qilinadi. Darslaringiz uzilib qolmasligi uchun to'lovni ertagi darsgacha amalga oshirishingizni so'raymiz.",
      ].join('\n'),
    );
  });

  it('says it once for two groups and carries both rows', () => {
    const a = reminder();
    const b = reminder({ enrollmentId: 'enr-2', groupName: 'B1-3' });
    const blocks = paymentReminderSection([a, b], 1900000, event);
    expect(textOf(blocks).match(/Ertaga/g)).toHaveLength(1);
    expect(blocks.flatMap((x) => x.itemIds)).toEqual([...a.ids, ...b.ids]);
  });

  describe('under the least share (ADR-0064)', () => {
    const half = (over: Partial<PaymentReminderDigestPayload> = {}) =>
      reminder({
        periodMonth: 11,
        lessonDate: '2026-11-04',
        minDue: 225000,
        minPaidPercent: 50,
        ...over,
      });

    it('names what admits to the lesson and the whole debt', () => {
      const blocks = paymentReminderSection([half()], 450000, event);
      expect(textOf(blocks)).toBe(
        [
          "⏰ <b>To'lov eslatmasi</b>",
          "Ertaga (04.11.2026) noyabrning 2-darsi bo'ladi.",
          "Darsga kirish uchun kamida: <b>225 000 so'm</b>",
          "Jami to'lash kerak: 450 000 so'm",
          '',
          "Shartnomaga ko'ra oylik to'lovning kamida yarmi 2-darsgacha qilinadi. Darslaringiz uzilib qolmasligi uchun to'lovni ertagi darsgacha amalga oshirishingizni so'raymiz.",
        ].join('\n'),
      );
    });

    it('never asks for more than is owed now', () => {
      const text = textOf(paymentReminderSection([half()], 100000, event));
      expect(text).toContain("Darsga kirish uchun kamida: <b>100 000 so'm</b>");
    });

    it('names another share by its percent', () => {
      const text = textOf(
        paymentReminderSection([half({ minPaidPercent: 40 })], 450000, event),
      );
      expect(text).toContain("to'lovning kamida 40% i 2-darsgacha qilinadi");
    });
  });

  it('contract 3.7: says how far the payments reach and by when to pay the rest', () => {
    const row = reminder({
      periodMonth: 11,
      lessonDate: '2026-11-16',
      paidThrough: { through: '2026-11-13', queuedFor: '2026-11-13' },
    });
    expect(textOf(paymentReminderSection([row], 225000, event))).toBe(
      [
        "⏰ <b>To'lov eslatmasi</b>",
        "Noyabr oyi uchun to'lovingiz 13.11.2026 dagi darsgacha yetadi.",
        "Qolgan to'lov: <b>225 000 so'm</b>",
        '',
        "Darslaringiz uzilib qolmasligi uchun to'lovni 16.11.2026 dagi darsgacha amalga oshirishingizni so'raymiz.",
      ].join('\n'),
    );
  });
});

describe('monthlyBillSection under the least share (ADR-0064)', () => {
  const november = (over: Partial<MonthlyChargeDigestPayload> = {}) =>
    bill({
      periodMonth: 11,
      price: 450000,
      chargedAmount: 450000,
      dueDate: '2026-11-04',
      minShare: 225000,
      ...over,
    });
  const lastLine = (balance: number) =>
    textOf(monthlyBillSection([november()], balance, '2026-11-01', event))
      .split('\n')
      .pop();

  it('asks for the least share by the 2nd lesson, the rest while paid lessons last', () => {
    expect(lastLine(-450000)).toBe(
      "Muddat: <b>04.11.2026</b> — oyning 2-darsigacha kamida 225 000 so'm, qolgani — to'langan darslar tugaguncha",
    );
  });

  it('adds the older debt to the least share', () => {
    expect(lastLine(-550000)).toContain("kamida 325 000 so'm");
  });

  it('counts what was carried over: with half already paid only the rest has a term', () => {
    expect(lastLine(-207692)).toBe("Muddat: to'langan darslar tugaguncha");
  });
});

describe('monthlyPaymentClosing', () => {
  it('asks to pay under a bill', () => {
    expect(monthlyPaymentClosing(true, false)).toEqual([
      "To'lov: markazda, Payme yoki Click orqali.",
      '🔗 Profilingiz: https://student.dafzentrum.uz',
    ]);
  });

  it("adds the reminder's line about questions, once, when a reminder is shown", () => {
    const expected = [
      "To'lov: markazda, Payme yoki Click orqali.",
      "Savollar bo'lsa, markaz administratoriga murojaat qiling.",
      '🔗 Profilingiz: https://student.dafzentrum.uz',
    ];
    expect(monthlyPaymentClosing(false, true)).toEqual(expected);
    expect(monthlyPaymentClosing(true, true)).toEqual(expected);
  });

  it('says nothing when nothing asks to pay', () => {
    expect(monthlyPaymentClosing(false, false)).toEqual([]);
  });
});

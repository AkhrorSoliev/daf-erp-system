import { MockRegistrationChannel, PaymentMethod } from '@prisma/client';
import {
  StatsExam,
  StatsParticipant,
  summarizeMockExam,
} from './mock-exam-stats';

const exam = (over: Partial<StatsExam> = {}): StatsExam => ({
  price: 55000,
  offeredLevels: ['A1', 'A2', 'B1', 'B2'],
  examTimes: ['09:00', '13:00'],
  announcedAt: null,
  ...over,
});

let seq = 0;
const row = (over: Partial<StatsParticipant> = {}): StatsParticipant => ({
  id: `p${++seq}`,
  registeredVia: MockRegistrationChannel.BOT,
  studentId: null,
  convertedAt: null,
  feeAmount: 55000,
  paid: false,
  paymentMethod: null,
  formData: {},
  level: 'B1',
  examTime: '09:00',
  telegramChatId: '555',
  resultSentAt: null,
  resultSendError: null,
  ...over,
});

const none = new Set<string>();

describe('summarizeMockExam', () => {
  it('splits registrations by channel and by DaF', () => {
    const s = summarizeMockExam(
      exam(),
      [
        row({ studentId: 10050 }),
        row({ registeredVia: MockRegistrationChannel.ADMIN }),
        row({
          registeredVia: MockRegistrationChannel.ADMIN,
          studentId: 10900,
          convertedAt: new Date('2026-08-02T10:00:00Z'),
        }),
      ],
      none,
    );

    expect(s.registered).toBe(3);
    expect(s.channel).toEqual({ bot: 1, admin: 2 });
    // A participant converted AFTER registering was not a DaF student then.
    expect(s.daf).toEqual({ student: 1, outsider: 2, converted: 1 });
  });

  it('counts money by the frozen fee, the old price fallback and cash intent', () => {
    const s = summarizeMockExam(
      exam(),
      [
        row({ paid: true, feeAmount: 45000 }),
        row({ paid: true, feeAmount: null }),
        row({ feeAmount: 55000, formData: { __payIntent: 'CASH' } }),
        row({ feeAmount: 55000 }),
        row({ feeAmount: 0 }),
      ],
      none,
    );

    expect(s.money).toEqual({
      paidCount: 2,
      paidSum: 100000,
      unpaidCount: 2,
      unpaidSum: 110000,
      cashIntentCount: 1,
      freeCount: 1,
    });
  });

  it('lists payment methods in a fixed order and never guesses a missing one', () => {
    const balancePaid = row({ paid: true, feeAmount: 30000 });
    const s = summarizeMockExam(
      exam(),
      [
        row({
          paid: true,
          paymentMethod: PaymentMethod.CLICK,
          feeAmount: 45000,
        }),
        row({ paid: true, paymentMethod: PaymentMethod.CASH }),
        row({ paid: true, paymentMethod: PaymentMethod.CASH }),
        balancePaid,
        row({ paid: true, feeAmount: 40000 }),
      ],
      new Set([balancePaid.id]),
    );

    expect(s.methods).toEqual([
      { method: 'CASH', count: 2, sum: 110000 },
      { method: 'CLICK', count: 1, sum: 45000 },
      { method: 'BALANCE', count: 1, sum: 30000 },
      { method: 'UNKNOWN', count: 1, sum: 40000 },
    ]);
  });

  it('orders levels as offered, then others, then «no level»', () => {
    const s = summarizeMockExam(
      exam({ offeredLevels: ['A1', 'B1'] }),
      [
        row({ level: 'B1', paid: true }),
        row({ level: 'B1' }),
        row({ level: 'C1' }),
        row({ level: null }),
        row({ level: 'A2' }),
      ],
      none,
    );

    expect(s.levels).toEqual([
      { level: 'A1', registered: 0, paid: 0 },
      { level: 'B1', registered: 2, paid: 1 },
      { level: 'A2', registered: 1, paid: 0 },
      { level: 'C1', registered: 1, paid: 0 },
      { level: null, registered: 1, paid: 0 },
    ]);
  });

  it('orders time slots as offered and adds «not chosen» only when present', () => {
    const s = summarizeMockExam(
      exam(),
      [row({ examTime: '13:00' }), row({ examTime: '13:00' })],
      none,
    );

    expect(s.times).toEqual([
      { time: '09:00', registered: 0 },
      { time: '13:00', registered: 2 },
    ]);
  });

  it('has no results figures before the results are announced', () => {
    expect(summarizeMockExam(exam(), [row()], none).results).toBeNull();
  });

  it('splits the results audience into delivered, no Telegram, failed and pending', () => {
    const sent = new Date('2026-08-03T10:00:00Z');
    const s = summarizeMockExam(
      exam({ announcedAt: sent }),
      [
        row({ paid: true, resultSentAt: sent }),
        row({ paid: true, telegramChatId: null }),
        row({ paid: true, resultSendError: 'Forbidden: bot was blocked' }),
        row({ paid: true }),
        // Unpaid: sent before the paid-only rule, still not in the audience.
        row({ resultSentAt: sent }),
        // Owes nothing: in the audience although unpaid.
        row({ feeAmount: 0, telegramChatId: null }),
      ],
      none,
    );

    expect(s.results).toEqual({
      audience: 5,
      delivered: 1,
      noTelegram: 2,
      failed: 1,
      pending: 1,
    });
  });

  it('answers zeros for an exam nobody registered for', () => {
    const s = summarizeMockExam(exam(), [], none);

    expect(s.registered).toBe(0);
    expect(s.methods).toEqual([]);
    expect(s.levels.map((l) => l.registered)).toEqual([0, 0, 0, 0]);
    expect(s.times).toEqual([
      { time: '09:00', registered: 0 },
      { time: '13:00', registered: 0 },
    ]);
  });
});

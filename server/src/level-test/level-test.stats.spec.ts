import {
  displayStatus,
  IDLE_AFTER_MS,
  summarize,
  type StatRow,
} from './level-test.stats';

const NOW = new Date('2026-10-24T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const row = (over: Partial<StatRow> = {}): StatRow => ({
  chatId: 'c1',
  status: 'COMPLETED',
  result: 'A2',
  answered: 20,
  createdAt: ago(5 * 60 * 1000),
  studentId: null,
  leadId: null,
  ...over,
});

describe('displayStatus', () => {
  it('yopilgan holatlar o‘zgarmaydi', () => {
    for (const s of [
      'COMPLETED',
      'STOPPED',
      'TIMED_OUT',
      'CANCELLED',
    ] as const) {
      expect(displayStatus(s, ago(10 * IDLE_AFTER_MS), NOW)).toBe(s);
    }
  });

  it('IN_PROGRESS: yangi — yechilmoqda, eski — tashlab ketilgan', () => {
    expect(displayStatus('IN_PROGRESS', ago(60_000), NOW)).toBe('RUNNING');
    expect(displayStatus('IN_PROGRESS', ago(IDLE_AFTER_MS), NOW)).toBe(
      'RUNNING',
    );
    expect(displayStatus('IN_PROGRESS', ago(IDLE_AFTER_MS + 1), NOW)).toBe(
      'ABANDONED',
    );
  });
});

describe('summarize', () => {
  it('bo‘sh oy — hamma nol', () => {
    const s = summarize([], NOW);
    expect(s.started).toBe(0);
    expect(s.people).toBe(0);
    expect(s.total).toBe(20);
    expect(Object.values(s.byResult).every((n) => n === 0)).toBe(true);
    expect(s.dropOff).toEqual({ to5: 0, to10: 0, to15: 0, to19: 0 });
  });

  it('holatlar yig‘indisi boshlanganlarga teng', () => {
    const rows = [
      row(),
      row({ status: 'STOPPED', result: 'A1', answered: 8 }),
      row({ status: 'TIMED_OUT', result: null, answered: 3 }),
      row({ status: 'CANCELLED', result: null, answered: 1 }),
      row({
        status: 'IN_PROGRESS',
        result: null,
        answered: 6,
        createdAt: ago(3 * IDLE_AFTER_MS),
      }),
      row({
        status: 'IN_PROGRESS',
        result: null,
        answered: 2,
        createdAt: ago(60_000),
      }),
    ];
    const s = summarize(rows, NOW);

    expect(s).toMatchObject({
      started: 6,
      finished: 1,
      stopped: 1,
      timedOut: 1,
      cancelled: 1,
      abandoned: 1,
      running: 1,
    });
    expect(
      s.finished +
        s.stopped +
        s.timedOut +
        s.cancelled +
        s.abandoned +
        s.running,
    ).toBe(s.started);
  });

  it('natija taqsimoti faqat natijasi bor urinishlardan', () => {
    const s = summarize(
      [
        row({ result: 'B1' }),
        row({ result: 'B1' }),
        row({ result: 'BEGINNER' }),
        row({ status: 'STOPPED', result: 'UNKNOWN', answered: 2 }),
        row({ status: 'CANCELLED', result: null, answered: 4 }),
      ],
      NOW,
    );
    expect(s.byResult).toEqual({
      BEGINNER: 1,
      A1: 0,
      A2: 0,
      B1: 2,
      B2: 0,
      UNKNOWN: 1,
    });
  });

  it('yarim qoldirganlar nechta savolda qolgani bo‘yicha taqsimlanadi', () => {
    const s = summarize(
      [
        row({ status: 'CANCELLED', result: null, answered: 0 }),
        row({ status: 'CANCELLED', result: null, answered: 4 }),
        row({ status: 'TIMED_OUT', result: null, answered: 5 }),
        row({ status: 'STOPPED', result: 'A1', answered: 9 }),
        row({ status: 'STOPPED', result: 'A2', answered: 10 }),
        row({
          status: 'IN_PROGRESS',
          result: null,
          answered: 17,
          createdAt: ago(2 * IDLE_AFTER_MS),
        }),
        row({ status: 'COMPLETED', answered: 20 }),
        row({
          status: 'IN_PROGRESS',
          result: null,
          answered: 3,
          createdAt: ago(1000),
        }),
      ],
      NOW,
    );
    // Tugatgan va hozir yechilayotgani hisobga olinmaydi.
    expect(s.dropOff).toEqual({ to5: 2, to10: 2, to15: 1, to19: 1 });
  });

  it('o‘quvchi/boshqa, lidga aylanganlar va har xil odamlar soni', () => {
    const s = summarize(
      [
        row({ chatId: 'a', studentId: 5 }),
        row({ chatId: 'a', studentId: 5 }),
        row({ chatId: 'b', leadId: 'L1' }),
        row({ chatId: 'c' }),
      ],
      NOW,
    );
    expect(s.students).toBe(2);
    expect(s.others).toBe(2);
    expect(s.leads).toBe(1);
    expect(s.people).toBe(3);
    expect(s.started).toBe(4);
  });

  it("tashlab ketilganlar va eng ko'p ketgan oraliq", () => {
    const s = summarize(
      [
        row({ status: 'TIMED_OUT', result: null, answered: 3 }),
        row({ status: 'CANCELLED', result: null, answered: 2 }),
        row({ status: 'STOPPED', result: 'A1', answered: 12 }),
        row({
          status: 'IN_PROGRESS',
          result: null,
          answered: 1,
          createdAt: ago(3 * IDLE_AFTER_MS),
        }),
      ],
      NOW,
    );
    expect(s.quit).toBe(3);
    expect(s.stopped).toBe(1);
    expect(s.topDropOff).toBe('to5');
    expect(summarize([row()], NOW).topDropOff).toBeNull();
  });
});

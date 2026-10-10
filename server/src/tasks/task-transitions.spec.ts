import { checkTransition, OPEN_STATUSES } from './task-transitions';

const base = {
  selfTask: false,
  kind: 'MANUAL' as const,
  requiresPhoto: false,
  hasFreshPhoto: false,
};

describe('checkTransition (spec §3.2)', () => {
  it('open statuses', () => {
    expect(OPEN_STATUSES).toEqual(['NEW', 'IN_PROGRESS', 'IN_REVIEW']);
  });
  it('assignee: NEW→IN_PROGRESS, NEW/IN_PROGRESS→IN_REVIEW', () => {
    expect(
      checkTransition({
        ...base,
        from: 'NEW',
        to: 'IN_PROGRESS',
        by: 'ASSIGNEE',
      }),
    ).toEqual({ ok: true });
    expect(
      checkTransition({
        ...base,
        from: 'NEW',
        to: 'IN_REVIEW',
        by: 'ASSIGNEE',
      }),
    ).toEqual({ ok: true });
    expect(
      checkTransition({
        ...base,
        from: 'IN_PROGRESS',
        to: 'IN_REVIEW',
        by: 'ASSIGNEE',
      }),
    ).toEqual({ ok: true });
  });
  it('assignee cannot close a shared task; a self task closes directly', () => {
    expect(
      checkTransition({
        ...base,
        from: 'IN_PROGRESS',
        to: 'DONE',
        by: 'ASSIGNEE',
      }).ok,
    ).toBe(false);
    expect(
      checkTransition({
        ...base,
        selfTask: true,
        from: 'IN_PROGRESS',
        to: 'DONE',
        by: 'ASSIGNEE',
      }),
    ).toEqual({ ok: true });
    expect(
      checkTransition({
        ...base,
        selfTask: true,
        from: 'NEW',
        to: 'IN_REVIEW',
        by: 'ASSIGNEE',
      }).ok,
    ).toBe(false);
  });
  it('manager: IN_REVIEW→DONE (accept), IN_REVIEW→IN_PROGRESS (return), any open→CANCELLED', () => {
    expect(
      checkTransition({
        ...base,
        from: 'IN_REVIEW',
        to: 'DONE',
        by: 'MANAGER',
      }),
    ).toEqual({ ok: true });
    expect(
      checkTransition({
        ...base,
        from: 'IN_REVIEW',
        to: 'IN_PROGRESS',
        by: 'MANAGER',
      }),
    ).toEqual({ ok: true });
    expect(
      checkTransition({ ...base, from: 'NEW', to: 'CANCELLED', by: 'MANAGER' }),
    ).toEqual({ ok: true });
    expect(
      checkTransition({
        ...base,
        from: 'IN_PROGRESS',
        to: 'DONE',
        by: 'MANAGER',
      }).ok,
    ).toBe(false);
  });
  it('closed tasks never reopen', () => {
    expect(
      checkTransition({
        ...base,
        from: 'DONE',
        to: 'IN_PROGRESS',
        by: 'MANAGER',
      }).ok,
    ).toBe(false);
    expect(
      checkTransition({ ...base, from: 'CANCELLED', to: 'NEW', by: 'MANAGER' })
        .ok,
    ).toBe(false);
  });
  it('requiresPhoto blocks review without a fresh photo', () => {
    const r = checkTransition({
      ...base,
      requiresPhoto: true,
      from: 'IN_PROGRESS',
      to: 'IN_REVIEW',
      by: 'ASSIGNEE',
    });
    expect(r).toEqual({
      ok: false,
      message: "Tekshiruvga yuborish uchun rasm qo'shing",
    });
    expect(
      checkTransition({
        ...base,
        requiresPhoto: true,
        hasFreshPhoto: true,
        from: 'IN_PROGRESS',
        to: 'IN_REVIEW',
        by: 'ASSIGNEE',
      }),
    ).toEqual({ ok: true });
  });
  it('system task: only NEW→IN_PROGRESS by the assignee', () => {
    const sys = { ...base, kind: 'LESSON_QUESTION' as const };
    expect(
      checkTransition({
        ...sys,
        from: 'NEW',
        to: 'IN_PROGRESS',
        by: 'ASSIGNEE',
      }),
    ).toEqual({ ok: true });
    expect(
      checkTransition({
        ...sys,
        from: 'IN_PROGRESS',
        to: 'IN_REVIEW',
        by: 'ASSIGNEE',
      }).ok,
    ).toBe(false);
    expect(
      checkTransition({ ...sys, from: 'NEW', to: 'CANCELLED', by: 'MANAGER' })
        .ok,
    ).toBe(false);
    expect(
      checkTransition({ ...sys, from: 'NEW', to: 'DONE', by: 'MANAGER' }),
    ).toEqual({
      ok: false,
      message: "Bu topshiriqni tizim o'zi yopadi",
    });
  });
  it('same status is refused', () => {
    expect(
      checkTransition({ ...base, from: 'NEW', to: 'NEW', by: 'ASSIGNEE' }).ok,
    ).toBe(false);
  });
});

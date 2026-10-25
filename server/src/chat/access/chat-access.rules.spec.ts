import {
  evaluateQuota,
  lockReasons,
  reasonText,
  tomorrowWarning,
  type AccessFacts,
  type DayUsage,
} from './chat-access.rules';

const TODAY = '2026-10-25';
const quota = { activeMin: 60, radioMin: 30 };
const day = (d: string, a: number, r: number): DayUsage => ({
  day: d,
  activeSeconds: a * 60,
  radioSeconds: r * 60,
});

describe('evaluateQuota', () => {
  it('counts today and the six days before it, not the seventh', () => {
    const q = evaluateQuota(
      [day('2026-10-19', 60, 30), day('2026-10-18', 999, 999)],
      TODAY,
      quota,
    );
    expect(q.activeMin).toBe(60); // 19.10 is the oldest day inside the window
    expect(q.radioMin).toBe(30);
    expect(q.ok).toBe(true);
  });

  it('is not ok one minute short and reports what is missing', () => {
    const q = evaluateQuota([day('2026-10-25', 59, 29)], TODAY, quota);
    expect(q.ok).toBe(false);
    expect(q.missingActiveMin).toBe(1);
    expect(q.missingRadioMin).toBe(1);
  });

  it('floors partial minutes', () => {
    const q = evaluateQuota(
      [{ day: TODAY, activeSeconds: 3599, radioSeconds: 1800 }],
      TODAY,
      quota,
    );
    expect(q.activeMin).toBe(59);
    expect(q.ok).toBe(false);
  });

  it('is always ok when the quota is zero', () => {
    expect(evaluateQuota([], TODAY, { activeMin: 0, radioMin: 0 }).ok).toBe(
      true,
    );
  });

  it('warns when the oldest day leaving the window breaks the quota tomorrow', () => {
    const q = evaluateQuota(
      [day('2026-10-19', 40, 0), day('2026-10-25', 20, 30)],
      TODAY,
      quota,
    );
    expect(q.ok).toBe(true);
    expect(q.tomorrow).toEqual({ needActiveMin: 40, needRadioMin: 0 });
  });

  it('gives no warning when tomorrow still holds', () => {
    const q = evaluateQuota([day('2026-10-25', 60, 30)], TODAY, quota);
    expect(q.tomorrow).toBeNull();
  });

  it('gives no warning when already locked', () => {
    const q = evaluateQuota([], TODAY, quota);
    expect(q.ok).toBe(false);
    expect(q.tomorrow).toBeNull();
  });
});

const good: AccessFacts = {
  balance: 0,
  gender: 'MALE',
  dateOfBirth: new Date('2000-01-01'),
  phone: '901234567',
  verifiedPhone: '901234567',
  chatBannedAt: null,
};
const okQuota = evaluateQuota([day(TODAY, 60, 30)], TODAY, quota);
const badQuota = evaluateQuota([], TODAY, quota);

describe('lockReasons', () => {
  it('is empty when everything holds', () => {
    expect(lockReasons(good, okQuota)).toEqual([]);
  });

  it('flags debt, only for a negative balance', () => {
    expect(lockReasons({ ...good, balance: -1 }, okQuota)).toEqual(['DEBT']);
    expect(lockReasons({ ...good, balance: 5000 }, okQuota)).toEqual([]);
  });

  it('flags a missing profile and an unproved phone', () => {
    expect(
      lockReasons({ ...good, gender: null, dateOfBirth: null }, okQuota),
    ).toEqual(['GENDER', 'BIRTH_DATE']);
    expect(lockReasons({ ...good, verifiedPhone: null }, okQuota)).toEqual([
      'PHONE',
    ]);
    // staff changed the number after the proof: unverified again
    expect(lockReasons({ ...good, phone: '907777777' }, okQuota)).toEqual([
      'PHONE',
    ]);
  });

  it('flags a ban and a short quota, in a stable order', () => {
    expect(
      lockReasons({ ...good, chatBannedAt: new Date() }, badQuota),
    ).toEqual(['BANNED', 'QUOTA']);
  });
});

describe('texts', () => {
  it('names both missing minutes', () => {
    const q = evaluateQuota([day(TODAY, 42, 10)], TODAY, quota);
    expect(reasonText('QUOTA', q)).toBe(
      'Ochish uchun yana 18 daqiqa ishlang va 20 daqiqa radio eshiting.',
    );
  });

  it('names only the missing half', () => {
    const q = evaluateQuota([day(TODAY, 60, 10)], TODAY, quota);
    expect(reasonText('QUOTA', q)).toBe(
      'Ochish uchun yana 20 daqiqa radio eshiting.',
    );
  });

  it('writes the tomorrow warning', () => {
    const q = evaluateQuota(
      [day('2026-10-19', 40, 0), day('2026-10-25', 20, 30)],
      TODAY,
      quota,
    );
    expect(tomorrowWarning(q)).toBe(
      'Ertaga yozish yopiladi. Bugun yana 40 daqiqa ishlang.',
    );
    expect(tomorrowWarning(okQuota)).toBeNull();
  });
});

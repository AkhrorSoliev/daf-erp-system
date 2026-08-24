import { TelegramGroupDigestService } from './telegram-group-digest.service';
import { DigestEntry } from './telegram-group-digest-buffer.service';
import { TG_GROUP_DIGEST_MAX_ITEMS } from './constants';

describe('TelegramGroupDigestService', () => {
  const service = new TelegramGroupDigestService();
  const NOW = new Date('2026-05-21T12:00:00.000Z'); // 17:00 Tashkent

  const student = (name: string, branchName?: string): DigestEntry => ({
    kind: 'student',
    at: '2026-05-21T09:05:00.000Z', // 14:05 Tashkent
    branchId: 1,
    studentId: 1,
    name,
    branchName,
  });
  const payment = (studentName: string, amount: number): DigestEntry => ({
    kind: 'payment',
    at: '2026-05-21T09:30:00.000Z',
    branchId: 1,
    studentName,
    amount,
    method: 'PAYME',
  });
  const group = (name: string): DigestEntry => ({
    kind: 'group',
    at: '2026-05-21T10:00:00.000Z',
    branchId: 2,
    name,
    branchName: 'Chilonzor',
    startDate: '2026-06-01T00:00:00.000Z',
  });

  it('returns null when there are no entries', () => {
    expect(service.build('DaF', [], NOW)).toBeNull();
  });

  it('renders a time window from the earliest entry to the flush time', () => {
    const msg = service.build('DaF', [student('Ali Valiyev')], NOW);
    expect(msg).toContain('14:05 – 17:00');
  });

  it('lists each new student under a branch sub-header', () => {
    const msg = service.build(
      'DaF',
      [student('Ali Valiyev', 'Chilonzor'), student('Dilnoza Rashidova')],
      NOW,
    )!;
    expect(msg).toContain("Yangi o'quvchilar (2)");
    expect(msg).toContain('🏢 <b>Chilonzor</b> (1)');
    expect(msg).toContain('• Ali Valiyev');
    // branchless students stay as plain bullets (no header)
    expect(msg).toContain('• Dilnoza Rashidova');
    // the branch is no longer repeated inline on every bullet
    expect(msg).not.toContain('• Ali Valiyev — Chilonzor');
  });

  it('groups many students of one branch under a single sub-header', () => {
    const msg = service.build(
      'DaF',
      [
        student('A One', 'Chilonzor'),
        student('B Two', 'Chilonzor'),
        student('C Three', 'Chilonzor'),
      ],
      NOW,
    )!;
    // branch name printed exactly once, not once per student
    expect(msg.match(/Chilonzor/g)?.length).toBe(1);
    expect(msg).toContain('🏢 <b>Chilonzor</b> (3)');
    expect(msg).toContain('• A One');
    expect(msg).toContain('• B Two');
    expect(msg).toContain('• C Three');
  });

  it('lists payments with a total sum', () => {
    const msg = service.build(
      'DaF',
      [payment('Ali V', 500_000), payment('Vali A', 300_000)],
      NOW,
    )!;
    expect(msg).toContain("To'lovlar (2)");
    // formatNumber joins thousands with a non-breaking space — normalise it.
    expect(msg.replace(/ /g, ' ')).toContain('jami <b>800 000 so');
    expect(msg).toContain('Payme');
  });

  it('lists new groups', () => {
    const msg = service.build('DaF', [group('B1-Intensiv')], NOW)!;
    expect(msg).toContain('Yangi guruhlar (1)');
    expect(msg).toContain('B1-Intensiv');
    expect(msg).toContain('01.06.2026');
  });

  it('renders all three sections when entries are mixed', () => {
    const msg = service.build(
      'DaF',
      [student('A B'), payment('C D', 100_000), group('G1')],
      NOW,
    )!;
    expect(msg).toContain("Yangi o'quvchilar");
    expect(msg).toContain("To'lovlar");
    expect(msg).toContain('Yangi guruhlar');
  });

  it('escapes HTML-sensitive characters in names', () => {
    const msg = service.build('DaF', [student('Ali <b>hack</b>')], NOW)!;
    expect(msg).toContain('Ali &lt;b&gt;hack&lt;/b&gt;');
    expect(msg).not.toContain('<b>hack');
  });

  it('caps long sections and collapses the overflow', () => {
    const many = Array.from({ length: TG_GROUP_DIGEST_MAX_ITEMS + 5 }, (_, i) =>
      student(`Student ${i}`),
    );
    const msg = service.build('DaF', many, NOW)!;
    expect(msg).toContain(
      `Yangi o'quvchilar (${TG_GROUP_DIGEST_MAX_ITEMS + 5})`,
    );
    expect(msg).toContain('va yana 5 ta');
  });
});

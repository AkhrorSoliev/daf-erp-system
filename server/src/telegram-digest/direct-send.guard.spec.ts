import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * ADR-0025: every Telegram notification waits for the 20:00 digest unless it
 * is on the instant list. This freezes who may call `.sendMessage(` directly,
 * so a new notification cannot slip past the queue by accident.
 *
 * Adding an entry is a product decision, not a code fix: put the message on
 * the instant list in the spec and ADR-0025 first, then here.
 */
const ALLOWED: string[] = [
  // The digest crons' own single sender.
  'src/telegram-digest/telegram-send.ts',
  // Instant by design — the spec's "O'zgarmaydi" table.
  'src/absence-pause/', // auto-pause reminders and pause notices
  'src/telegram/', // bot flows, registration, OTP, mock exams
  'src/sms/sms.service.ts', // admin free text + lesson cancel/reschedule
  'src/lesson-cancellations/lesson-cancellation-events.listener.ts',
  'src/lesson-reschedules/lesson-reschedule-events.listener.ts',
  'src/attendance/attendance-reminder.service.ts', // lesson start/end reminders
  'src/attendance/student-attendance-notification.listener.ts', // flag-gated, off
  'src/notifications/notification-events.listener.ts', // payment-promise.overdue (09:00) only
  'src/telegram-groups/telegram-admin-bot-registrar.ts', // group bot commands
  'src/telegram-groups/telegram-group-announcement.service.ts', // product news
  'src/telegram-groups/telegram-group-daily-cron.service.ts', // 21:00 report
];

const ROOT = join(__dirname, '..', '..'); // server/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

const callers = walk(join(ROOT, 'src'))
  .filter((file) => /\.sendMessage\(/.test(readFileSync(file, 'utf8')))
  .map((file) => relative(ROOT, file).split('\\').join('/'))
  .sort();

const isAllowed = (path: string) =>
  ALLOWED.some((entry) =>
    entry.endsWith('/') ? path.startsWith(entry) : path === entry,
  );

describe('direct Telegram sends — ADR-0025', () => {
  it('finds the sender it is built around (a scan that matches nothing proves nothing)', () => {
    expect(callers).toContain('src/telegram-digest/telegram-send.ts');
  });

  it('allows direct sendMessage only in the instant senders', () => {
    const offenders = callers.filter((path) => !isAllowed(path));
    expect({
      offenders,
      fix: 'queue it via TelegramDigestQueueService, or put it on the instant list in the spec and ADR-0025 first',
    }).toEqual({ offenders: [], fix: expect.any(String) });
  });

  it('keeps the allow-list honest — every file entry still sends directly', () => {
    const stale = ALLOWED.filter(
      (entry) => !entry.endsWith('/') && !callers.includes(entry),
    );
    expect(stale).toEqual([]);
  });
});

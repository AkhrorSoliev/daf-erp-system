import { TelegramGroupDigestService } from './telegram-group-digest.service';
import { TG_GROUP_DIGEST_MAX_ITEMS } from './constants';
import { Prisma, TelegramDigestCategory } from '@prisma/client';
import {
  DigestPayloadByCategory,
  TelegramDigestItemRow,
} from '../telegram-digest/telegram-digest-payloads';
import { DigestBlock } from '../telegram-digest/telegram-message-parts';

describe('TelegramGroupDigestService.buildBlocks', () => {
  const service = new TelegramGroupDigestService();
  const NOW = new Date('2026-05-21T15:00:00.000Z'); // 20:00 Tashkent

  let seq = 0;
  function row<C extends TelegramDigestCategory>(
    category: C,
    payload: DigestPayloadByCategory[C],
    opts: { at?: string; relatedEntityId?: string | null } = {},
  ): TelegramDigestItemRow {
    seq += 1;
    return {
      id: `g-${seq}`,
      companyId: 1001,
      branchId: null,
      category,
      relatedEntityId: opts.relatedEntityId ?? null,
      payload: payload as unknown as Prisma.JsonValue,
      createdAt: new Date(opts.at ?? '2026-05-21T09:05:00.000Z'), // 14:05
    };
  }

  const text = (blocks: DigestBlock[] | null) =>
    (blocks ?? [])
      .map((b) => b.text)
      .join('\n')
      .replace(/\u00A0/g, ' ');

  const newStudent = (name: string, branchName: string | null = null) =>
    row(TelegramDigestCategory.GROUP_NEW_STUDENT, {
      studentId: 1,
      name,
      branchName,
    });

  const change = (
    overrides: Partial<DigestPayloadByCategory['GROUP_STATUS_CHANGE']>,
    relatedEntityId: string | null = null,
  ) =>
    row(
      TelegramDigestCategory.GROUP_STATUS_CHANGE,
      {
        entityType: 'Student',
        entityId: '10042',
        name: 'Aziza Karimova',
        transition: 'STUDENT_FROZEN',
        reason: null,
        actorName: null,
        actorRole: null,
        branchName: null,
        ...overrides,
      },
      { relatedEntityId },
    );

  it('returns null for no rows', () => {
    expect(service.buildBlocks('DaF', [], NOW)).toBeNull();
  });

  it('shows a same-day window as HH:MM – HH:MM', () => {
    expect(
      text(service.buildBlocks('DaF', [newStudent('Ali Valiyev')], NOW)),
    ).toContain('🕐 14:05 – 20:00');
  });

  it('shows dates when the window spans days (after a Sunday or holiday)', () => {
    const early = row(
      TelegramDigestCategory.GROUP_NEW_STUDENT,
      { studentId: 2, name: 'B', branchName: null },
      { at: '2026-05-19T15:30:00.000Z' }, // 19.05 20:30
    );
    expect(text(service.buildBlocks('DaF', [early], NOW))).toContain(
      '🕐 19.05 20:30 – 21.05 20:00',
    );
  });

  it('groups new students under one sub-header per branch, branchless last', () => {
    const msg = text(
      service.buildBlocks(
        'DaF',
        [
          newStudent('A One', 'Chilonzor'),
          newStudent('B Two', 'Chilonzor'),
          newStudent('C Three'),
        ],
        NOW,
      ),
    );
    expect(msg).toContain("👨‍🎓 <b>Yangi o'quvchilar (3)</b>");
    expect(msg).toContain('🏢 <b>Chilonzor</b> (2)');
    expect(msg.match(/Chilonzor/g)).toHaveLength(1);
    expect(msg.indexOf('• C Three')).toBeGreaterThan(msg.indexOf('• B Two'));
  });

  it('lists large and online payments under the renamed header with a total', () => {
    const msg = text(
      service.buildBlocks(
        'DaF',
        [
          row(TelegramDigestCategory.GROUP_PAYMENT, {
            paymentId: 'p1',
            studentName: 'Ali V',
            amount: 500000,
            method: 'PAYME',
          }),
          row(TelegramDigestCategory.GROUP_PAYMENT, {
            paymentId: 'p2',
            studentName: 'Vali A',
            amount: 300000,
            method: 'TRANSFER',
          }),
        ],
        NOW,
      ),
    );
    expect(msg).toContain(
      "💳 <b>Yirik va onlayn to'lovlar (2)</b> — jami <b>800 000 so'm</b>",
    );
    expect(msg).toContain("• Ali V — <b>500 000 so'm</b> (Payme)");
    expect(msg).toContain("• Vali A — <b>300 000 so'm</b> (Bank o'tkazmasi)");
  });

  it('lists new groups with their start date', () => {
    const msg = text(
      service.buildBlocks(
        'DaF',
        [
          row(TelegramDigestCategory.GROUP_NEW_GROUP, {
            groupId: 'g1',
            name: 'B1-Intensiv',
            branchName: 'Chilonzor',
            startDate: '2026-06-01T00:00:00.000Z',
          }),
        ],
        NOW,
      ),
    );
    expect(msg).toContain('👥 <b>Yangi guruhlar (1)</b>');
    expect(msg).toContain('• B1-Intensiv (01.06.2026)');
  });

  it('renders a status change as one line with icon, reason, actor and time', () => {
    const msg = text(
      service.buildBlocks(
        'DaF',
        [
          change({
            reason: "to'lov qilmadi",
            actorName: 'Dilnoza Karimova',
            actorRole: 'Administrator',
            branchName: 'Chilonzor',
          }),
          change({
            entityType: 'Group',
            entityId: 'g1',
            name: 'B1-Intensiv',
            transition: 'GROUP_COMPLETED',
          }),
          change({ transition: 'STUDENT_GRADUATED', name: 'Bobur Aliyev' }),
          change({
            transition: 'STUDENT_REACTIVATED',
            name: 'Kamola Sodiqova',
          }),
        ],
        NOW,
      ),
    );
    expect(msg).toContain("🔄 <b>Holat o'zgarishlari (4)</b>");
    expect(msg).toContain(
      "• ❄️ Aziza Karimova: muzlatildi — sabab: to'lov qilmadi · Dilnoza Karimova (Administrator), 14:05",
    );
    expect(msg).toContain('• 🏁 B1-Intensiv guruhi: tugadi, 14:05');
    expect(msg).toContain('• 🎓 Bobur Aliyev: bitirdi, 14:05');
    expect(msg).toContain('• ✅ Kamola Sodiqova: qaytadan faol, 14:05');
  });

  it('escapes names and reasons', () => {
    const msg = text(
      service.buildBlocks(
        'DaF',
        [newStudent('Ali <b>hack</b>'), change({ reason: 'a < b & c' })],
        NOW,
      ),
    );
    expect(msg).toContain('Ali &lt;b&gt;hack&lt;/b&gt;');
    expect(msg).toContain('sabab: a &lt; b &amp; c');
    expect(msg).not.toContain('<b>hack');
  });

  it('caps a long section and gives the overflow line the ids it hides', () => {
    const many = Array.from({ length: TG_GROUP_DIGEST_MAX_ITEMS + 5 }, (_, i) =>
      newStudent(`Student ${i}`),
    );
    const blocks = service.buildBlocks('DaF', many, NOW)!;
    const overflow = blocks.find((b) => b.text.includes('va yana 5 ta'));
    expect(overflow?.itemIds).toHaveLength(5);
  });

  it('merges exact duplicate status events into one line', () => {
    const a = change({}, 'Student:10042:STUDENT_FROZEN');
    const b = change({}, 'Student:10042:STUDENT_FROZEN');
    const blocks = service.buildBlocks('DaF', [a, b], NOW)!;
    expect(text(blocks).match(/muzlatildi/g)).toHaveLength(1);
    expect(blocks.flatMap((x) => x.itemIds).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });

  it('puts every row id into exactly one block', () => {
    const rows = [
      newStudent('A', 'Chilonzor'),
      row(TelegramDigestCategory.GROUP_PAYMENT, {
        paymentId: 'p1',
        studentName: 'B',
        amount: 600000,
        method: 'CASH',
      }),
      row(TelegramDigestCategory.GROUP_NEW_GROUP, {
        groupId: 'g1',
        name: 'G',
        branchName: null,
        startDate: null,
      }),
      change({}),
    ];
    const ids = service
      .buildBlocks('DaF', rows, NOW)!
      .flatMap((b) => b.itemIds);
    expect(ids.sort()).toEqual(rows.map((r) => r.id).sort());
  });
});

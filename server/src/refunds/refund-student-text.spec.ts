import {
  htmlToPlainText,
  refundCancelledText,
  refundHandedOverText,
  refundRequestedText,
} from './refund-student-text';

// formatSum prints a no-break space between the thousands.
const S = ' ';

describe('refund student texts (spec §5.4, CEO 10.10)', () => {
  it('request opened — pinned', () => {
    expect(
      refundRequestedText({
        firstName: 'Mohira',
        amount: 350000,
        dueDate: '2026-10-23',
        balance: 0,
        phone: '901234567',
      }),
    ).toBe(
      [
        "<b>🔄 Pulni qaytarish so'rovi qabul qilindi</b>",
        '',
        'Hurmatli Mohira!',
        '',
        `Qaytariladigan summa: <b>350${S}000 so'm</b>`,
        'Pul <b>23-oktabrgacha</b> qaytarib beriladi.',
        "Bu summa hisobingizdan ushlab turiladi — joriy balansingiz: <b>0 so'm</b>",
        '',
        "📞 Savol bo'lsa: +998 90 123 45 67",
        '',
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('request opened — no phone leaves the 📞 line (and its blank line) out', () => {
    const t = refundRequestedText({
      firstName: 'Mohira',
      amount: 350000,
      dueDate: '2026-10-23',
      balance: 0,
      phone: null,
    });
    expect(t).not.toContain('📞');
    expect(t).not.toContain('\n\n\n');
  });

  it('handed over — cash and card wording, pinned', () => {
    const cash = refundHandedOverText({
      firstName: 'Mohira',
      amount: 350000,
      method: 'CASH',
      handedOverDay: '2026-10-16',
      receiptUrl: 'https://api.example.uz/api/receipts/refund/r1.pdf',
    });
    expect(cash).toBe(
      [
        '<b>✅ Pulingiz qaytarib berildi</b>',
        '',
        'Hurmatli Mohira!',
        '',
        `<b>350${S}000 so'm</b> qaytarib berildi — <b>naqd</b>.`,
        'Sana: <b>16.10.2026</b>',
        '',
        '📄 Kvitansiya: https://api.example.uz/api/receipts/refund/r1.pdf',
        '',
        "DaF Sprachzentrum'ni tanlaganingiz uchun rahmat!",
      ].join('\n'),
    );
    const card = refundHandedOverText({
      firstName: 'Mohira',
      amount: 350000,
      method: 'TRANSFER',
      handedOverDay: '2026-10-16',
      receiptUrl: 'u',
    });
    expect(card).toContain('— <b>kartaga</b>.');
  });

  it('cancelled — pinned, reason escaped', () => {
    expect(
      refundCancelledText({
        firstName: 'Mohira',
        amount: 350000,
        reason: "o'qishni davom ettiradi",
        balance: 350000,
        phone: '901234567',
      }),
    ).toBe(
      [
        "<b>↩️ Pulni qaytarish so'rovi bekor qilindi</b>",
        '',
        'Hurmatli Mohira!',
        '',
        `<b>350${S}000 so'm</b> qaytarish so'rovingiz bekor qilindi.`,
        "Sabab: o'qishni davom ettiradi",
        `Pul hisobingizga qaytdi — joriy balansingiz: <b>350${S}000 so'm</b>`,
        '',
        "📞 Savol bo'lsa: +998 90 123 45 67",
      ].join('\n'),
    );
    expect(
      refundCancelledText({
        firstName: 'A',
        amount: 1000,
        reason: '<x>',
        balance: 0,
        phone: null,
      }),
    ).toContain('Sabab: &lt;x&gt;');
  });

  it('an empty first name greets with «Assalomu alaykum!»; a name is escaped', () => {
    expect(
      refundRequestedText({
        firstName: '',
        amount: 1000,
        dueDate: '2026-10-23',
        balance: 0,
        phone: null,
      }),
    ).toContain('\nAssalomu alaykum!\n');
    expect(
      refundRequestedText({
        firstName: 'A&B',
        amount: 1000,
        dueDate: '2026-10-23',
        balance: 0,
        phone: null,
      }),
    ).toContain('Hurmatli A&amp;B!');
  });

  it('htmlToPlainText strips tags, decodes entities, keeps lines', () => {
    expect(htmlToPlainText('<b>💰 Hisob</b>\n\nHurmatli A&amp;B!')).toBe(
      '💰 Hisob\n\nHurmatli A&B!',
    );
  });
});

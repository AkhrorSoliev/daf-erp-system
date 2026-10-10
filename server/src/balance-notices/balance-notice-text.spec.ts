import { balanceNoticeText } from './balance-notice-text';

describe('balanceNoticeText — second version, CEO 10.10.2026 (do not reword)', () => {
  it('pins the approved text (spec §5.3)', () => {
    expect(
      balanceNoticeText({
        firstName: 'Mohira',
        balance: 350_000,
        allowedFrom: '2026-11-22',
        phone: '901234567',
      }),
    ).toBe(
      [
        '<b>💰 Hisobingizda pul qolgan</b>',
        '',
        'Hurmatli Mohira!',
        '',
        // formatSum prints a no-break space between the thousands.
        "DaF Sprachzentrum hisobingizda <b>350 000 so'm</b> qolgan.",
        "Uni qaytarib olish uchun <b>22-noyabrgacha</b> filial raqamiga qo'ng'iroq qiling:",
        '📞 +998 90 123 45 67',
        '',
        "⚠️ Shu kungacha murojaat bo'lmasa, shartnomaga ko'ra pul <b>markaz hisobiga o'tadi</b>.",
        '',
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('a single-digit day has no leading zero; the name is HTML-safe', () => {
    const text = balanceNoticeText({
      firstName: 'A<b>',
      balance: 5_000,
      allowedFrom: '2026-12-05',
      phone: '901234567',
    });
    expect(text).toContain('<b>5-dekabrgacha</b>');
    expect(text).toContain('Hurmatli A&lt;b&gt;!');
  });

  it('an empty first name greets with «Assalomu alaykum!»', () => {
    const text = balanceNoticeText({
      firstName: '',
      balance: 5_000,
      allowedFrom: '2026-12-05',
      phone: '901234567',
    });
    expect(text).toContain('\nAssalomu alaykum!\n');
  });
});

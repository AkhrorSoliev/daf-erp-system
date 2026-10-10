import { balanceNoticeText } from './balance-notice-text';

describe('balanceNoticeText — variant 1, CEO 10.10.2026 (do not reword)', () => {
  it('pins the approved text', () => {
    expect(
      balanceNoticeText({
        firstName: 'Ali',
        balance: 350_000,
        allowedFrom: '2026-11-22',
        phone: '901234567',
      }),
    ).toBe(
      "Assalomu alaykum, Ali! DaF Sprachzentrum hisobingizda 350 000 so'm qolgan. Uni qaytarib olish uchun 22-noyabrgacha filial raqamiga qo'ng'iroq qiling: +998 90 123 45 67. Shu kungacha murojaat bo'lmasa, shartnomaga ko'ra pul markaz hisobiga o'tadi. Rahmat!",
    );
  });

  it('a single-digit day has no leading zero; the name is HTML-safe', () => {
    const text = balanceNoticeText({
      firstName: 'A<b>',
      balance: 5_000,
      allowedFrom: '2026-12-05',
      phone: '901234567',
    });
    expect(text).toContain('5-dekabrgacha');
    expect(text).toContain('Assalomu alaykum, A&lt;b&gt;!');
  });
});

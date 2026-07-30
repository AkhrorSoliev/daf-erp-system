import { buildStaffCredentialsMessage } from './staff-credentials-message';

describe('buildStaffCredentialsMessage', () => {
  const base = {
    phone: '901234567',
    password: 'Zr24qUyG',
    portalUrl: 'https://lehrer.dafzentrum.uz',
  };

  it('login sifatida telefon raqamni ko\'rsatadi', () => {
    const text = buildStaffCredentialsMessage(base);
    expect(text).toContain('901234567');
    expect(text).toContain('telefon raqamingiz');
  });

  it('telefon va parolni backtick ichida beradi (Telegramda ko\'chirish uchun)', () => {
    const text = buildStaffCredentialsMessage(base);
    expect(text).toContain('`901234567`');
    expect(text).toContain('`Zr24qUyG`');
  });

  it('portal havolasini Markdown ko\'rinishida beradi', () => {
    const text = buildStaffCredentialsMessage(base);
    expect(text).toContain('[lehrer.dafzentrum.uz](https://lehrer.dafzentrum.uz)');
  });

  it('admin portal havolasi bilan ham ishlaydi', () => {
    const text = buildStaffCredentialsMessage({
      ...base,
      portalUrl: 'https://admin.dafzentrum.uz',
    });
    expect(text).toContain('[admin.dafzentrum.uz](https://admin.dafzentrum.uz)');
  });

  it('chet el raqamini saqlangan holicha ko\'rsatadi', () => {
    const text = buildStaffCredentialsMessage({ ...base, phone: '491749493338' });
    expect(text).toContain('`491749493338`');
  });

  it('username so\'zini ishlatmaydi', () => {
    const text = buildStaffCredentialsMessage(base);
    expect(text.toLowerCase()).not.toContain('username');
  });
});

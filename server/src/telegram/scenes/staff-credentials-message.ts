/**
 * Ustoz/xodim ro'yxatdan o'tgach yuboriladigan login-parol xabari.
 *
 * NEGA LOGIN = TELEFON: tizimga kirish 2026-07-15 dan beri (PR #333) barcha
 * rollarda telefon raqam bilan. Avval bot ism-familiyadan username yasab
 * («namangantest») shuni «login» deb aytardi — bot bir narsani aytib, kirish
 * sahifasi boshqasini so'rardi.
 *
 * Raqam backtick ichida — Telegramda bir tegishda ko'chiriladi. Bazada
 * saqlangan holicha ko'rsatiladi (O'zbekiston → 9 xona, chet el → mamlakat
 * kodi bilan), shunda foydalanuvchi ko'rgan narsasini aynan kiritadi.
 */
export function buildStaffCredentialsMessage(input: {
  phone: string;
  password: string;
  portalUrl: string;
}): string {
  const { phone, password, portalUrl } = input;
  const domain = portalUrl.replace('https://', '');

  return (
    "✅ Ro'yxatdan muvaffaqiyatli o'tdingiz!\n\n" +
    `📱 Sizning login (telefon raqamingiz): \`${phone}\`\n` +
    `🔑 Sizning parol: \`${password}\`\n\n` +
    '🌐 Platformaga kirish:\n' +
    `[${domain}](${portalUrl})\n\n` +
    '⚠️ Parolni eslab qoling yoki saqlang!'
  );
}

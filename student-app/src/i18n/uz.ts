/**
 * App copy — Latin Uzbek ONLY (never Cyrillic/Arabic letters).
 * Single source so copy is OTA-updatable via EAS Update.
 */
export const t = {
  common: {
    loading: 'Yuklanmoqda...',
    retry: 'Qayta urinish',
    error: 'Xatolik yuz berdi',
    save: 'Saqlash',
    cancel: 'Bekor qilish',
  },
  auth: {
    phoneLabel: 'Telefon raqami',
    phonePlaceholder: '90 123 45 67',
    continue: 'Davom etish',
    otpTitle: 'Tasdiqlash kodi',
    otpHint: 'Telegram bot yuborgan kodni kiriting',
    login: 'Kirish',
    forgot: 'Parolni unutdingizmi?',
  },
  forgotPassword: {
    title: 'Parolni tiklash',
    step1Hint:
      'Telefon raqamingizni kiriting — SMS orqali tasdiqlash kodi yuboramiz.',
    step2Hint: 'Raqamingizga yuborilgan 4 xonali kodni kiriting.',
    step3Hint: "Yangi parolingizni o'rnating.",
    codeLabel: 'Tasdiqlash kodi',
    newPasswordLabel: 'Yangi parol',
    confirmPasswordLabel: 'Parolni takrorlang',
    newPasswordPlaceholder: 'Kamida 6 ta belgi',
    sendCode: 'Kod yuborish',
    verify: 'Tasdiqlash',
    save: 'Saqlash',
    resend: 'Qayta yuborish',
    changeNumber: "Raqamni o'zgartirish",
    successTitle: "Parol o'zgartirildi",
    successMessage: 'Endi yangi parol bilan kirishingiz mumkin.',
    errPhone: "Telefon raqamni to'liq kiriting",
    errCode: "Kod 4 xonali bo'lishi kerak",
    errPassword: "Parol kamida 6 ta belgidan iborat bo'lishi kerak",
    errMismatch: 'Parollar mos kelmadi',
  },
  tabs: {
    home: 'Asosiy',
    schedule: 'Jadval',
    attendance: 'Davomat',
    payments: "To'lovlar",
    profile: 'Profil',
  },
  home: {
    greeting: 'Assalomu alaykum',
    balance: 'Balans',
  },
  placeholders: {
    schedule: 'Jadval bu yerda ko‘rsatiladi',
    attendance: 'Davomat tarixi bu yerda ko‘rsatiladi',
    payments: "To'lovlar va balans bu yerda ko‘rsatiladi",
    profile: 'Profil ma‘lumotlari bu yerda ko‘rsatiladi',
    comingSoon: 'Tez orada',
  },
} as const;

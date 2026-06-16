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

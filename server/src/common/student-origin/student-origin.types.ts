/**
 * Har bir o'quvchi lid sifatida tug'iladi. `create()` ga BERILISHI SHART bo'lgan
 * bu parametr "bu odam qayerdan keldi?" degan savolga javob berishga majbur
 * qiladi — `skipLead?: boolean` ko'rinishidagi ixtiyoriy bayroq unutilishi
 * mumkin edi, majburiy union tipni unutib bo'lmaydi.
 *
 * DIRECT — /students eshigi. Lid yozuvi yo'q, tizim uni o'zi yaratadi.
 * LEAD   — LeadsService.convert. Lid allaqachon bor, ikkinchisi yaratilmaydi.
 */
export type StudentOrigin =
  | { kind: 'DIRECT'; sourceId: string }
  | { kind: 'LEAD'; leadId: string };

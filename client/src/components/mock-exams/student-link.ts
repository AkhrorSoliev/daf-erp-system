/**
 * Ishtirokchini markaz o'quvchisiga bog'lash — «Qo'lda qo'shish» oynasidagi
 * o'quvchi qidiruvining sof qoidalari.
 *
 * Ilgari bu yerda «O'quvchi ID» degan bo'sh maydon bor edi: admin 5 xonali
 * raqamni boshqa sahifadan topib yozishi kerak edi va maydon nimaga
 * kerakligi tushunarsiz edi. Endi o'quvchi ism, telefon yoki ID bo'yicha
 * qidirib tanlanadi; server esa avvalgidek `studentId` ni oladi.
 */

/** `GET /students` qatoridan qidiruv ko'rsatadigan maydonlar. */
export interface LinkableStudent {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  photo: string | null;
  status: string;
}

/** Oynadagi ism, familya va telefon maydonlari. */
export interface ParticipantIdentity {
  firstName: string;
  lastName: string;
  phone: string;
}

/**
 * Qidiruv so'zini serverga moslaydi. Kartada telefon 9 raqam bo'lib turadi
 * (`901234567`), admin esa uni `+998 90 123 45 67` deb yozishi mumkin —
 * server `contains` bilan qidiradi va bo'shliq yoki `+998` bilan hech narsa
 * topmasdi. Harfi bor so'z (ism) o'zgarmaydi.
 *
 * `998` faqat u davlat kodi ekani aniq bo'lganda olinadi: oldida `+` bor
 * yoki raqam 9 tadan uzun. `99 812 34 56` kabi mahalliy raqam ham `998`
 * bilan boshlanadi — uni qisqartirib bo'lmaydi.
 */
export function normalizeStudentSearch(raw: string): string {
  const trimmed = raw.trim();
  if (!/^[\d\s+()-]+$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  const hasCountryCode =
    digits.startsWith("998") && (trimmed.startsWith("+") || digits.length > 9);
  return hasCountryCode ? digits.slice(3) : digits;
}

function cardIdentity(student: LinkableStudent): ParticipantIdentity {
  const digits = student.phone.replace(/\D/g, "");
  return {
    firstName: student.firstName.trim(),
    lastName: student.lastName.trim(),
    // Forma faqat 9 xonali O'zbekiston raqamini qabul qiladi; kartadagi
    // xorijiy raqam formaga tushmaydi — uni admin o'zi yozadi.
    phone: /^\d{9}$/.test(digits) ? digits : "",
  };
}

/**
 * O'quvchi tanlanganda ism, familya va telefon kartadan olinadi. Tanlov
 * olib tashlansa yoki boshqa o'quvchi tanlansa, oldingi kartadan kelgan va
 * admin o'zgartirmagan qiymatlar tozalanadi — qo'lda yozilgani qoladi.
 */
export function identityAfterLink(
  current: ParticipantIdentity,
  previous: LinkableStudent | null,
  next: LinkableStudent | null,
): ParticipantIdentity {
  const fromPrevious = previous ? cardIdentity(previous) : null;
  const kept = (key: keyof ParticipantIdentity) =>
    fromPrevious && fromPrevious[key] !== "" && current[key] === fromPrevious[key]
      ? ""
      : current[key];

  if (!next) {
    return {
      firstName: kept("firstName"),
      lastName: kept("lastName"),
      phone: kept("phone"),
    };
  }
  const card = cardIdentity(next);
  return {
    firstName: card.firstName,
    lastName: card.lastName,
    phone: card.phone || kept("phone"),
  };
}

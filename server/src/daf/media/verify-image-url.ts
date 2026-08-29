/**
 * R2'ga yuklangan rasmning OMMAVIY manzili haqiqatan ham rasm
 * qaytarishini tekshiradi.
 *
 * Nega kerak: `R2Uploader.uploadMissing()` obyektni R2'ga S3 API orqali
 * (Kalitni oddiy satr sifatida) yozadi — bu har doim muvaffaqiyatli
 * bo'lishi mumkin, hatto kalitda HTTP manzilda xavfli belgi (`#`, `?`,
 * bo'shliq) bo'lsa ham. Lekin o'sha kalit KEYINROQ ommaviy manzilga
 * (`R2_PUBLIC_URL + '/' + key`) qo'shilganda, brauzer/`fetch` uni URL
 * sifatida talqin qiladi va xavfli belgidan keyingi qismni tashlab
 * yuboradi — natijada 404 (yoki boshqa noto'g'ri obyekt). Yuklash
 * bosqichining o'zi bu xatoni HECH QACHON ko'rmaydi, chunki u to'g'ridan
 * to'g'ri kalit bilan ishlaydi. Shuning uchun ko'rik ro'yxati
 * chiqarilishidan OLDIN, aynan OMMAVIY manzilning o'zi so'raladi —
 * `imageKeyFor` qanchalik to'g'ri yozilgan bo'lishidan qat'i nazar,
 * haqiqiy iste'molchi (o'quvchi brauzeri) ko'radigan yo'l tekshiriladi.
 */

export interface UrlCheckResult {
  /** `true` — HTTP 200 VA `content-type` rasm ekanini tasdiqladi. */
  ok: boolean;
  status: number;
  contentType: string | null;
}

export async function verifyImageUrl(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<UrlCheckResult> {
  const res = await fetchFn(url);
  const contentType = res.headers.get('content-type');
  return {
    ok: res.ok && contentType !== null && contentType.startsWith('image/'),
    status: res.status,
    contentType,
  };
}

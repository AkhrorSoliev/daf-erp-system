import Cookies from "js-cookie";
import type { FaollikPayload } from "./activity-tracker";

/**
 * Faollikni serverga yuboradi (dizayn 4.5). `fetch(..., { keepalive: true })` —
 * sahifa yopilayotganda ham so'rov yetib boradi; `sendBeacon` Authorization
 * header qo'ya olmaydi.
 *
 * `ok` — qabul qilindi. `rad` — qayta yuborishdan foyda yo'q (400 noto'g'ri tana,
 * 403 begona seans, 409 seans kuni o'tgan). `xato` — keyin qayta urinish
 * (401 token muddati o'tgan, tarmoq, server). Qiymatlar jami, shuning uchun
 * keyingi yuborish yo'qolganini o'zi yetkazadi.
 */
export type YuborishNatija = "ok" | "rad" | "xato";

/**
 * `status` — HTTP status kodi (javob kelgan bo'lsa). Chaqiruvchiga kerak
 * bo'lganda (masalan, doimiy 400ni bir marta ogohlantirish uchun) xom
 * kodni ko'rish imkonini beradi; `natija` esa asosiy tasnif — aksariyat
 * chaqiruvchilar faqat shuni tekshiradi.
 */
export interface YuborishJavobi {
  natija: YuborishNatija;
  status: number | null;
}

export interface YuborishMuhiti {
  fetchFn: typeof fetch;
  token: string | undefined;
  base: string | undefined;
}

export function brauzerMuhiti(): YuborishMuhiti {
  return {
    // Wrapped rather than the bare `fetch`: `yubor` calls it as
    // `muhit.fetchFn(...)`, and browsers reject `fetch` invoked with any
    // `this` but the global object before the request leaves the page — the
    // catch in `yubor` would then report it as a retryable failure forever.
    fetchFn: (input, init) => fetch(input, init),
    token: Cookies.get("token"),
    base: process.env.NEXT_PUBLIC_API_URL,
  };
}

export function natijaFor(status: number): YuborishNatija {
  if (status >= 200 && status < 300) return "ok";
  if (status === 400 || status === 403 || status === 409) return "rad";
  return "xato";
}

export async function yubor(
  payload: FaollikPayload,
  muhit: YuborishMuhiti = brauzerMuhiti(),
): Promise<YuborishJavobi> {
  if (!muhit.token || !muhit.base) return { natija: "xato", status: null };
  try {
    const res = await muhit.fetchFn(`${muhit.base}/student-portal/activity`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${muhit.token}`,
      },
      body: JSON.stringify(payload),
    });
    return { natija: natijaFor(res.status), status: res.status };
  } catch {
    return { natija: "xato", status: null };
  }
}

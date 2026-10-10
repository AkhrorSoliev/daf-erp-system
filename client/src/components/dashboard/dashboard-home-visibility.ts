import type { Can } from "@/lib/permission-check";
import type {
  DashboardAttention,
  DashboardNextLesson,
} from "./dashboard-summary-types";

/**
 * Bosh sahifaning rol mantiqi — ATAYLAB komponentlardan ajratilgan.
 *
 * Loyihaning vitest sozlamasi `environment: "node"` (jsdom ham,
 * testing-library ham yo'q), ya'ni render testi yozib bo'lmaydi. Kim nimani
 * ko'rishi — moliyaviy ma'lumot ko'rsatilishini hal qiladigan qaror, u
 * sinovsiz qolmasligi kerak. Shuning uchun u shu yerda, sof funksiya sifatida.
 */

export interface HomeSections {
  /** 4 ta pul kartasi. */
  money: boolean;
  /** 4 ta odam sanagichi. */
  people: boolean;
  /** «E'tibor talab qiladi» bloki umuman chiziladimi. */
  attention: boolean;
  /** Blok ichidagi outreach qatorlari (kelmaganlar, va'dalar, navbat). */
  attentionOutreachRows: boolean;
  /** Keyingi darslar bloki. */
  nextLessons: boolean;
  /** Lid voronkasi chizig'i — backend CEO/BD/Administrator ga ochiq. */
  leadFunnel: boolean;
  /**
   * «Batafsil» havolasi `/reports/leads` ga. Administrator ham ochadi (CEO
   * qarori, 13.09.2026) — `reports-nav.ts` da shu sahifa unga ochiq.
   */
  leadFunnelDetails: boolean;
}

export function resolveHomeSections(can: Can): HomeSections {
  const money = can("reports.finance");
  const outreach = can("outreach.view");
  const staff = can("dashboard.view");
  return {
    money,
    people: staff,
    attention: staff,
    attentionOutreachRows: outreach,
    nextLessons: staff,
    leadFunnel: can("reports.leads"),
    leadFunnelDetails: can("reports.leads"),
  };
}

export interface AttentionRow {
  key: "absentees" | "brokenPromises" | "removalQueue";
  label: string;
  count: number;
  href: string;
  /** Qanchalik shoshilinch — rangni shu belgilaydi. */
  tone: "danger" | "warning";
}

/**
 * Soni `0` bo'lgan qator umuman qaytarilmaydi: bosh sahifa nollar bilan
 * to'ldirilmaydi, ro'yxatda faqat bugun haqiqatan bajarish kerak bo'lgan ish
 * turadi.
 */
export function visibleAttentionRows(
  attention: DashboardAttention,
  opts: { includeOutreach: boolean },
): AttentionRow[] {
  if (!opts.includeOutreach) return [];
  const rows: AttentionRow[] = [
    {
      key: "absentees",
      label: "Bugun darsga kelmadi",
      count: attention.todayAbsentees,
      href: "/outreach",
      tone: "danger",
    },
    {
      key: "brokenPromises",
      label: "Muddati o'tgan to'lov va'dasi",
      count: attention.brokenPromises,
      href: "/outreach",
      tone: "danger",
    },
    {
      key: "removalQueue",
      label: "Ketma-ket 3 marta kelmadi",
      count: attention.removalQueue,
      href: "/outreach",
      tone: "warning",
    },
  ];
  return rows.filter((r) => r.count > 0);
}

/** "HH:mm" ni kun boshidan hisoblangan daqiqaga aylantiradi. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Hozirgi vaqtdan keyin tugaydigan darslar — davom etayotgani ham kiradi,
 * chunki u hali «o'tib ketmagan». Kirish ro'yxati saralanmagan bo'lishi
 * mumkin, shuning uchun bu yerda o'zi saralaydi.
 */
export function pickNextLessons(
  lessons: DashboardNextLesson[],
  now: string,
  limit = 5,
): DashboardNextLesson[] {
  const nowMin = timeToMinutes(now);
  return [...lessons]
    .filter((l) => timeToMinutes(l.endTime) > nowMin)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
    .slice(0, limit);
}

/**
 * `GET /dashboard/summary` javobining shakli.
 *
 * Faza 1 da bu tiplarni `home-fixture.ts` to'ldiradi, Faza 2 da esa haqiqiy
 * so'rov. Shuning uchun bu fayl ikkala fazada ham o'zgarmaydi — ko'rinish
 * komponentlari faqat shu tiplarga tayanadi.
 */

/** Faqat CEO (1) va filial direktori (2) uchun. Boshqa rollarda `null`. */
export interface DashboardMoney {
  /** Shu oy kassaga tushgan pul. */
  monthIncome: number;
  /** Shu oydagi to'lovlar soni — «Bu oy tushum» kartasining ost-satri. */
  paymentCount: number;
  /**
   * Oy oxirigi prognoz — o'tilgan va rejadagi darslar qiymati.
   * `monthIncome` bilan BOSHQA bazada: ikkovi ayirilmaydi.
   */
  expectedMonthEnd: number;
  netProfit: number;
  /**
   * `'cash'` — kanonik sof foyda hisoblanmadi va bu eski kassa raqami.
   * Bunda karta o'zini «Foyda (kassa asosida)» deb ataydi, chunki kassa
   * raqami sof foydadan ancha yuqori chiqadi.
   */
  netProfitBasis: "recognized" | "cash";
  debt: { total: number; count: number };
}

/** Rol 1, 2, 3, 5 uchun. */
export interface DashboardPeople {
  activeStudents: number;
  newThisMonth: number;
  /** Shu oy chiqarilgan + guruhdan tushib qolgan. */
  leftThisMonth: number;
  activeGroups: number;
  /** Shu oyning o'rtacha davomati, 0–100. */
  attendancePct: number;
  todayLessons: number;
}

export interface DashboardTopDebtor {
  id: number;
  name: string;
  /** Har doim manfiy — qarz. */
  balance: number;
}

/**
 * Rol 1, 2, 3 uchun to'liq. Kassir (5) da faqat `topDebtors` to'ladi,
 * qolgan uch son `0` bo'ladi — outreach endpointlari unga ochiq emas.
 */
export interface DashboardAttention {
  todayAbsentees: number;
  brokenPromises: number;
  removalQueue: number;
  topDebtors: DashboardTopDebtor[];
}

export interface DashboardNextLesson {
  groupId: string;
  groupName: string;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  teacherName: string | null;
  roomName: string | null;
  studentCount: number;
}

export interface DashboardSummary {
  money: DashboardMoney | null;
  people: DashboardPeople | null;
  attention: DashboardAttention | null;
  /** Filial tanlanmagan («Barcha filiallar») holatda `null`. */
  nextLessons: DashboardNextLesson[] | null;
  /** Yiqilgan bo'limlar nomi, masalan `["money"]`. */
  failed: string[];
}

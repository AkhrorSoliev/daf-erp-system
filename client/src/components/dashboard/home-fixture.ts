import type { DashboardSummary } from "./dashboard-summary-types";

/**
 * FAZA 1 UCHUN SOXTA MA'LUMOT — joylashuvni localhostda ko'rish uchun.
 *
 * Faza 2 da `GET /dashboard/summary` yozilgach BU FAYL O'CHIRILADI va
 * `home-overview.tsx` uni `useQuery` ga almashtiradi. Boshqa hech qayerda
 * import qilinmasin.
 *
 * Raqamlar o'ylab topilgan; haqiqiy bazadan olinmagan.
 */
export const HOME_FIXTURE: DashboardSummary = {
  money: {
    monthIncome: 128_450_000,
    paymentCount: 214,
    expectedMonthEnd: 176_200_000,
    netProfit: 18_930_000,
    netProfitBasis: "recognized",
    debt: { total: 27_748_684, count: 177 },
  },
  people: {
    activeStudents: 842,
    newThisMonth: 63,
    leftThisMonth: 19,
    activeGroups: 47,
    attendancePct: 88,
    todayLessons: 34,
  },
  attention: {
    todayAbsentees: 12,
    brokenPromises: 5,
    removalQueue: 3,
    topDebtors: [
      { id: 10061, name: "Sardor Nazarov", balance: -1_240_000 },
      { id: 10284, name: "Malika Yo'ldosheva", balance: -980_000 },
      { id: 10453, name: "Jasur Rahimov", balance: -845_000 },
      { id: 10655, name: "Nilufar Qodirova", balance: -720_000 },
      { id: 10338, name: "Bekzod Ismoilov", balance: -615_000 },
    ],
  },
  nextLessons: [
    { groupId: "g1", groupName: "A1-07", startTime: "09:00", endTime: "10:30", teacherName: "Aziza Karimova", roomName: "101-xona", studentCount: 14 },
    { groupId: "g2", groupName: "A2-03", startTime: "10:40", endTime: "12:10", teacherName: "Otabek Yusupov", roomName: "102-xona", studentCount: 11 },
    { groupId: "g3", groupName: "B1-02", startTime: "14:00", endTime: "15:30", teacherName: "Dilnoza Ergasheva", roomName: "203-xona", studentCount: 9 },
    { groupId: "g4", groupName: "A1-11", startTime: "16:00", endTime: "17:30", teacherName: "Aziza Karimova", roomName: "101-xona", studentCount: 15 },
    { groupId: "g5", groupName: "B2-01", startTime: "17:40", endTime: "19:10", teacherName: null, roomName: "205-xona", studentCount: 8 },
  ],
  failed: [],
};

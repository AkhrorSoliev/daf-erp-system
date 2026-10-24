/**
 * Reyting jadvallaridagi ism — markaz, guruh va liga xonasi bir xil
 * ko'rsatadi: to'liq ism, qisqartirilmaydi (06.09 §6.1 — markaz jadvali
 * filiallarni ataylab aralashtiradi, bu CEO qarori).
 */
export function reytingIsmi(s: {
  firstName: string;
  lastName: string;
}): string {
  return `${s.firstName} ${s.lastName}`;
}

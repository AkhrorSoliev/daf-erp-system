export interface Course {
  id: string;
  name: string;
  description: string;
  lesson_duration: number;
  course_duration: number;
  price: number;
  is_enabled: boolean;
}

export const courses: Course[] = [
  {
    id: "1",
    name: "Deutsch A1",
    description: "Nemis tili boshlang'ich daraja. Kundalik mavzular, oddiy gaplar va asosiy grammatika.",
    lesson_duration: 36,
    course_duration: 3,
    price: 1500000,
    is_enabled: true,
  },
  {
    id: "2",
    name: "Deutsch A2",
    description: "Nemis tili elementar daraja. Kundalik vaziyatlarda muloqot qilish ko'nikmalari.",
    lesson_duration: 36,
    course_duration: 3,
    price: 1800000,
    is_enabled: true,
  },
  {
    id: "3",
    name: "Deutsch B1",
    description: "Nemis tili o'rta daraja. Mustaqil fikr bildirish va murakkab matnlarni tushunish.",
    lesson_duration: 48,
    course_duration: 4,
    price: 2200000,
    is_enabled: true,
  },
  {
    id: "4",
    name: "Deutsch B2",
    description: "Nemis tili yuqori o'rta daraja. Professional va akademik maqsadlarda til qo'llash.",
    lesson_duration: 48,
    course_duration: 4,
    price: 2500000,
    is_enabled: true,
  },
  {
    id: "5",
    name: "Deutsch C1",
    description: "Nemis tili ilg'or daraja. Murakkab matnlar, ilmiy va kasbiy sohalarda erkin muloqot.",
    lesson_duration: 60,
    course_duration: 5,
    price: 3000000,
    is_enabled: true,
  },
  {
    id: "6",
    name: "TestDaF tayyorlov",
    description: "TestDaF imtihoniga tayyorgarlik kursi. Barcha bo'limlar bo'yicha mashqlar.",
    lesson_duration: 24,
    course_duration: 2,
    price: 3500000,
    is_enabled: true,
  },
  {
    id: "7",
    name: "Deutsch Intensiv A1-A2",
    description: "A1 va A2 darajalarni qisqa muddatda o'zlashtirish uchun intensiv kurs.",
    lesson_duration: 60,
    course_duration: 3,
    price: 2800000,
    is_enabled: false,
  },
];

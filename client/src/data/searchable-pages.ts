export interface SearchablePage {
  label: string;
  url: string;
  keywords: string[];
}

export const searchablePages: SearchablePage[] = [
  { label: "Bosh sahifa", url: "/", keywords: ["home", "bosh", "asosiy"] },
  { label: "O'qituvchilar", url: "/teachers", keywords: ["teacher", "oqituvchi", "ustoz"] },
  { label: "O'quvchilar", url: "/students", keywords: ["student", "oquvchi", "talaba"] },
  { label: "Lidlar", url: "/leads", keywords: ["lead", "lid", "yangi"] },
  { label: "Guruhlar", url: "/groups", keywords: ["group", "guruh", "sinf"] },
  { label: "Topshiriqlar", url: "/tasks", keywords: ["task", "topshiriq", "vazifa"] },
  { label: "Dars jadvali", url: "/schedule", keywords: ["schedule", "jadval", "dars"] },
  { label: "Moliya", url: "/payments", keywords: ["payment", "moliya", "tolov", "pul"] },
  { label: "To'lovlar", url: "/payments/list", keywords: ["to'lovlar", "tolovlar", "kvitansiya", "tushum", "bekor qilingan to'lov"] },
  { label: "Xarajatlar", url: "/payments/expenses", keywords: ["xarajat", "ijara", "kommunal", "soliq", "chiqim"] },
  { label: "Hisobotlar", url: "/reports", keywords: ["report", "hisobot", "statistika"] },
  { label: "Guruhlar bo'yicha to'lov", url: "/reports/payment-reports", keywords: ["guruh to'lovi", "qarzdor guruh", "ustoz bo'yicha to'lov", "to'lov hisoboti"] },
  { label: "Sozlamalar", url: "/settings", keywords: ["setting", "sozlama", "config"] },
  // Sozlamalarning ichki sahifalari bu yerda yo'q: ular `settings-nav.ts` dan
  // olinadi va faqat foydalanuvchi ochishi mumkinlari qidiruvga kiradi
  // (`settingsSearchPages`, `use-global-search.ts`).
  { label: "Profil", url: "/profile", keywords: ["profile", "profil", "shaxsiy"] },
];

export function filterPages(
  query: string,
  pages: SearchablePage[] = searchablePages,
): SearchablePage[] {
  const q = query.toLowerCase();
  return pages.filter(
    (page) =>
      page.label.toLowerCase().includes(q) ||
      page.keywords.some((kw) => kw.includes(q)),
  );
}

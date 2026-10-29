import { msg } from "@/i18n/msg";

/** `label` is a `msg()` text: the dropdown draws it with `t()`. Keywords stay Uzbek. */
export interface SearchablePage {
  label: string;
  url: string;
  keywords: string[];
}

export const searchablePages: SearchablePage[] = [
  { label: msg("Bosh sahifa"), url: "/", keywords: ["home", "bosh", "asosiy"] },
  { label: msg("O'qituvchilar"), url: "/teachers", keywords: ["teacher", "oqituvchi", "ustoz"] },
  { label: msg("O'quvchilar"), url: "/students", keywords: ["student", "oquvchi", "talaba"] },
  { label: msg("Lidlar"), url: "/leads", keywords: ["lead", "lid", "yangi"] },
  { label: msg("Guruhlar"), url: "/groups", keywords: ["group", "guruh", "sinf"] },
  { label: msg("Topshiriqlar"), url: "/tasks", keywords: ["task", "topshiriq", "vazifa"] },
  { label: msg("Dars jadvali"), url: "/schedule", keywords: ["schedule", "jadval", "dars"] },
  { label: msg("Moliya"), url: "/payments", keywords: ["payment", "moliya", "tolov", "pul"] },
  { label: msg("To'lovlar"), url: "/payments/list", keywords: ["to'lovlar", "tolovlar", "kvitansiya", "tushum", "bekor qilingan to'lov"] },
  { label: msg("Xarajatlar"), url: "/payments/expenses", keywords: ["xarajat", "ijara", "kommunal", "soliq", "chiqim"] },
  { label: msg("Hisobotlar"), url: "/reports", keywords: ["report", "hisobot", "statistika"] },
  { label: msg("Guruhlar bo'yicha to'lov"), url: "/reports/payment-reports", keywords: ["guruh to'lovi", "qarzdor guruh", "ustoz bo'yicha to'lov", "to'lov hisoboti"] },
  { label: msg("Oyni yopish"), url: "/reports/oyni-yopish", keywords: ["oyni yopish", "bank xizmati", "bank xarajati", "oy hisobi"] },
  { label: msg("Sozlamalar"), url: "/settings", keywords: ["setting", "sozlama", "config"] },
  // Sozlamalarning ichki sahifalari bu yerda yo'q: ular `settings-nav.ts` dan
  // olinadi va faqat foydalanuvchi ochishi mumkinlari qidiruvga kiradi
  // (`settingsSearchPages`, `use-global-search.ts`).
  { label: msg("Profil"), url: "/profile", keywords: ["profile", "profil", "shaxsiy"] },
];

/**
 * A page matches by its title as the dropdown shows it (`t`), by its Uzbek-Latin
 * title, or by an Uzbek keyword, so Latin Uzbek finds a page in every language.
 */
export function filterPages(
  query: string,
  pages: SearchablePage[] = searchablePages,
  t: (source: string) => string = (source) => source,
): SearchablePage[] {
  const q = query.toLowerCase();
  return pages.filter(
    (page) =>
      t(page.label).toLowerCase().includes(q) ||
      page.label.toLowerCase().includes(q) ||
      page.keywords.some((kw) => kw.includes(q)),
  );
}

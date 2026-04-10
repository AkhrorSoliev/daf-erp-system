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
  { label: "Hisobotlar", url: "/reports", keywords: ["report", "hisobot", "statistika"] },
  { label: "Sozlamalar", url: "/settings", keywords: ["setting", "sozlama", "config"] },
  { label: "Umumiy sozlamalar", url: "/settings/general", keywords: ["general", "umumiy"] },
  { label: "Kurslar", url: "/settings/courses", keywords: ["course", "kurs", "fan"] },
  { label: "Filiallar", url: "/settings/branches", keywords: ["branch", "filial"] },
  { label: "Xodimlar", url: "/settings/employees", keywords: ["employee", "xodim", "ishchi"] },
  { label: "Xonalar", url: "/settings/rooms", keywords: ["room", "xona", "sinf"] },
  { label: "Dam olish kunlari", url: "/settings/holidays", keywords: ["holiday", "dam", "bayram"] },
  { label: "Arxiv", url: "/settings/archive", keywords: ["archive", "arxiv"] },
  { label: "Profil", url: "/profile", keywords: ["profile", "profil", "shaxsiy"] },
];

export function filterPages(query: string): SearchablePage[] {
  const q = query.toLowerCase();
  return searchablePages.filter(
    (page) =>
      page.label.toLowerCase().includes(q) ||
      page.keywords.some((kw) => kw.includes(q)),
  );
}

/**
 * Qo'llanma kadrlari. `nom` — `public/qollanma/rasmlar/<nom>.png`.
 * Selektor Playwright tilida (role=, text=, css). Tasdiqlash tugmasi hech
 * qachon bosilmaydi.
 */
export const KADRLAR = [
  {
    nom: "boshlash/bosh-sahifa",
    url: "/",
    kutish: "text=Aktiv o'quvchilar",
    belgilar: [
      { selector: "[data-sidebar=sidebar]", raqam: 1 },
      { selector: 'header >> role=button[name="Barcha filiallar"]', raqam: 2 },
      { selector: 'header >> input[placeholder="Qidirish..."]', raqam: 3 },
      { selector: 'role=button[name="Shu sahifa bo\'yicha qo\'llanma"]', raqam: 4 },
    ],
    kesish: null,
  },
  {
    nom: "oquvchilar/oquvchi-kartasi",
    url: (s) => `/students/profile/${s.oylikOquvchiId}`,
    kutish: "role=tab[name=\"Guruhlar\"]",
    belgilar: [
      { selector: "role=tablist", raqam: 1 },
      { selector: "text=To'lov", raqam: 2 },
    ],
    kesish: null,
  },
  {
    nom: "oquvchilar/guruhdan-chiqarish",
    url: (s) => `/students/profile/${s.oylikOquvchiId}`,
    // Guruh kartasidagi «Chiqarish» oynani OCHADI; oynadagi «Chiqarish» bosilmaydi.
    tayyorla: async (page) => {
      await page.getByRole("button", { name: "Chiqarish" }).first().click();
    },
    kutish: "role=alertdialog",
    belgilar: [
      { selector: "role=alertdialog >> [data-slot=select-trigger]", raqam: 1 },
      { selector: 'role=radiogroup[name="Pulni qaytarish tartibi"]', raqam: 2 },
      { selector: "role=alertdialog >> span[title=\"O'tgan dars\"]", raqam: 3 },
      { selector: "role=alertdialog >> role=status", raqam: 4 },
      { selector: "role=alertdialog >> [data-slot=alert-dialog-action]", raqam: 5 },
    ],
    kesish: "role=alertdialog",
  },
  {
    nom: "tolovlar/tolov-qayd-qilish",
    url: "/payments/pending",
    tayyorla: async (page) => {
      await page.getByRole("button", { name: "To'lov qayd qilish" }).first().click();
    },
    kutish: "role=dialog",
    belgilar: [],
    kesish: "role=dialog",
  },
  {
    nom: "tolovlar/qarzdorlik",
    url: "/payments/debt",
    kutish: "role=tablist",
    belgilar: [{ selector: "role=tablist", raqam: 1 }],
    kesish: null,
  },
  {
    nom: "davomat/davomat-olish",
    url: (s) => `/groups/${s.oylikGuruhId}`,
    kutish: "role=tab[name=\"Davomat\"]",
    belgilar: [],
    kesish: null,
  },
];

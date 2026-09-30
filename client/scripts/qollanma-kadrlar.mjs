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
];

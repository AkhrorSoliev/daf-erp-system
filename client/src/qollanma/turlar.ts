import type { LucideIcon } from "lucide-react";

/** 1 CEO, 2 Filial direktori, 3 Administrator, 4 O'qituvchi, 5 Kassir. */
export type RolId = 1 | 2 | 3 | 4 | 5;

export interface QollanmaSahifa {
  bolim: string;
  sahifa: string;
  sarlavha: string;
  /** 1–2 gap: sahifa boshidagi blok, qidiruv natijasi va «?» Sheet. */
  qisqacha: string;
  rollar: RolId[];
  /** Sahifa tushuntiradigan ADR raqamlari ("0044"). */
  adr: string[];
  /**
   * «?» tugmasi chiqadigan ERP marshrutlari: aniq yo'l yoki oxirida "/*"
   * (bir yoki bir nechta segment). Query parametrlari hisobga olinmaydi.
   */
  yollar: string[];
  kalitSozlar: string[];
  /** YYYY-MM-DD */
  yangilangan: string;
}

export interface QollanmaBolim {
  id: string;
  nom: string;
  tavsif: string;
  icon: LucideIcon;
}

export interface Yangilik {
  /** YYYY-MM-DD — e'lon qilingan kun. */
  sana: string;
  sarlavha: string;
  matn: string;
  /** Yo'q bo'lsa — hamma ko'radi. */
  rollar?: RolId[];
  sahifa?: { bolim: string; sahifa: string };
}

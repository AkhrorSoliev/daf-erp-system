import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  DollarSign,
  GraduationCap,
  Receipt,
  Rocket,
  Send,
  Settings,
  Smartphone,
  UserPlus,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { QollanmaBolim } from "./turlar";

/** Tartib — menyu va reyestr tartibi. */
export const bolimlar: QollanmaBolim[] = [
  { id: "boshlash", nom: "Boshlash", tavsif: "Kirish, ekran, rollar, topshiriqlar, lug'at", icon: Rocket },
  { id: "oquvchilar", nom: "O'quvchilar", tavsif: "Qabul, guruhga qo'shish, muzlatish, chiqarish", icon: BookOpen },
  { id: "guruhlar", nom: "Guruhlar", tavsif: "Guruh, holatlar, dars o'zgarishlari, jadval", icon: UsersRound },
  { id: "davomat", nom: "Davomat", tavsif: "Davomat olish, darsga qo'yish, «Dars bo'ldimi?», pauza", icon: ClipboardCheck },
  { id: "tolovlar", nom: "To'lovlar", tavsif: "Oylik to'lov, dars paketi, qarzdorlik, qaytarish", icon: DollarSign },
  { id: "ustoz-oyligi", nom: "Ustoz oyligi", tavsif: "Stavka, hisoblash, avans, berish", icon: Wallet },
  { id: "xarajatlar", nom: "Xarajatlar", tavsif: "Xarajat va filial kassasi", icon: Receipt },
  { id: "hisobotlar", nom: "Hisobotlar", tavsif: "Tushum, sof foyda, Excel, boshqa hisobotlar", icon: BarChart3 },
  { id: "lidlar", nom: "Lidlar", tavsif: "Lidlar, formalar, aloqa markazi", icon: UserPlus },
  { id: "mock-imtihonlar", nom: "Mock imtihonlar", tavsif: "Imtihon, ishtirokchi, to'lov", icon: GraduationCap },
  { id: "telegram", nom: "Telegram", tavsif: "Xabarlar vaqti, bot, hisobot guruhlari", icon: Send },
  { id: "sozlamalar", nom: "Sozlamalar", tavsif: "Filial, xodim, to'lov, sabablar, arxiv", icon: Settings },
  { id: "daf-ilova", nom: "DaF ilovasi", tavsif: "Ilova faolligi va media", icon: Smartphone },
];

export function bolimTopish(id: string): QollanmaBolim | undefined {
  return bolimlar.find((b) => b.id === id);
}

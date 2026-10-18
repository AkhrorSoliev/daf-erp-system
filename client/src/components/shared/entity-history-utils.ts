import {
  ArrowRightLeft,
  Bot,
  ClipboardCheck,
  Clock,
  FileCheck2,
  FileX2,
  GraduationCap,
  Link2,
  MessageSquare,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Unplug,
  UserCheck,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@/i18n/msg";

/** Draws a `msg()` text in the page language; identity keeps the Uzbek output. */
type Translate = (source: string) => string;
const uzbek: Translate = (source) => source;

export interface HistoryRecord {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE" | "RESTORE";
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  changedBy: {
    id: number;
    firstName: string;
    lastName: string;
    photo: string | null;
    roles?: { role: { id: number } }[];
  } | null;
  createdAt: string;
}

// --- Field labels (texnik nom → o'zbekcha; null = yashirin) ---
export const FIELD_LABELS: Record<string, string | null> = {
  firstName: msg("Ism"),
  lastName: msg("Familiya"),
  phone: msg("Telefon"),
  status: msg("Holat"),
  name: msg("Ism"),
  login: msg("Login"),
  kirishHisobi: msg("Kirish hisobi"),
  gender: msg("Jinsi"),
  balance: msg("Balans"),
  mainBranch: msg("Asosiy filial"),
  guruh: msg("Guruh"),
  sabab: msg("Sabab"),
  // Lead owner (ADR-0093).
  masul: msg("Mas'ul"),
  // Oy to'lovi bilan nima bo'lgani (shartnoma 6.2, ADR-0043).
  pul: msg("Pul"),
  // Berilgan hujjat: shartnoma va qatnashganlik hujjati.
  raqam: msg("Hujjat raqami"),
  daraja: msg("Daraja"),
  istisno: msg("Istisno"),
  reason: msg("Sabab"),
  content: msg("Izoh"),
  isActive: msg("Faolmi"),
  photo: msg("Rasm"),
  comment: msg("Izoh"),
  dateOfBirth: msg("Tug'ilgan sana"),
  telefonTasdigi: msg("Telefon tasdig'i"),
  address: msg("Manzil"),
  telegram: msg("Telegram"),
  extraPhone: msg("Zaxira raqam"),
  parentName: msg("Ota-ona ismi"),
  parentPhone: msg("Ota-ona telefoni"),
  placeOfStudy: msg("O'qish joyi"),
  passportSeries: msg("Pasport seriyasi"),
  // Yashiriladigan texnik field lar
  id: null,
  action: null,
  // Old COMMENT_ADDED history rows (from before the task mode was removed) still carry it.
  isTask: null,
  commentId: null,
  companyId: null,
  userId: null,
  telegramChatId: null,
  telegramDisconnectedAt: null,
  // The proved number and its time (ADR-0039) — the card's badge shows the
  // verdict; an archive row carrying the raw columns should not.
  verifiedPhone: null,
  phoneVerifiedAt: null,
  nomi: msg("Nomi"),
  kunlar: msg("Kunlar"),
  vaqt: msg("Vaqt"),
  boshlanish: msg("Boshlanish sanasi"),
  oquvchi: msg("O'quvchi"),
  ustoz: msg("Ustoz"),
  ustozlar: msg("Ustozlar"),
  startDate: msg("Boshlanish sanasi"),
  endDate: msg("Tugash sanasi"),
  lessonStartTime: msg("Dars boshlanishi"),
  lessonEndTime: msg("Dars tugashi"),
  lessonMinutes: msg("Dars davomiyligi (daq)"),
  level: msg("Daraja"),
  days: msg("Kunlar"),
  exactDays: null,
  roomId: null,
  courseId: null,
  branchId: null,
  groupNumber: msg("Guruh raqami"),
  statusEnum: msg("Holat"),
  previousGroupId: null,
  maxStudents: msg("Maks. o'quvchilar"),
  monthlyPayment: msg("Oylik to'lov"),
  capacity: msg("Sig'imi"),
  price: msg("Narxi"),
  description: msg("Tavsif"),
  guruhId: null,
  oquvchiId: null,
  // Davomat tarixi field lari
  sana: msg("Sana"),
  jami: msg("Jami"),
  keldi: msg("Keldi"),
  kelmadi: msg("Kelmadi"),
  kechikdi: msg("Kechikdi"),
  sababli: msg("Sababli"),
};

export function getFieldLabel(key: string, t: Translate = uzbek): string | null {
  if (key in FIELD_LABELS) {
    const label = FIELD_LABELS[key];
    return label === null ? null : t(label);
  }
  // Aniq belgilanmagan maydonlarni kalit nomi bilan ko'rsatish
  return key;
}

// --- Kontekstli action aniqlash ---
export interface ActionInfo {
  label: string;
  icon: LucideIcon;
  variant: "default" | "secondary" | "destructive" | "outline";
}

export function getActionInfo(record: HistoryRecord): ActionInfo {
  const nv = record.newValues as Record<string, unknown> | null;
  const ov = record.oldValues as Record<string, unknown> | null;
  const customAction = (nv?.action ?? ov?.action) as string | undefined;

  switch (record.action) {
    case "CREATE":
      if (customAction === "DAVOMAT_OLINDI")
        return { label: msg("Davomat olindi"), icon: ClipboardCheck, variant: "default" };
      if (customAction === "COMMENT_ADDED")
        return { label: msg("Izoh qo'shildi"), icon: MessageSquare, variant: "secondary" };
      if (customAction === "TELEGRAM_ROYXATDAN_OTDI")
        return { label: msg("Telegram orqali ro'yxatdan o'tdi"), icon: Bot, variant: "default" };
      if (customAction === "GURUHGA_QOSHILDI")
        return { label: msg("Guruhga qo'shildi"), icon: UserPlus, variant: "default" };
      if (customAction === "OQUVCHI_QOSHILDI")
        return { label: msg("O'quvchi qo'shildi"), icon: UserPlus, variant: "default" };
      if (customAction === "SMS_YUBORILDI")
        return { label: msg("SMS yuborildi"), icon: MessageSquare, variant: "default" };
      if (customAction === "SMS_YUBORILMADI")
        return { label: msg("SMS yuborilmadi"), icon: MessageSquare, variant: "destructive" };
      // The bot learned the student's chat refuses it, or takes it again (ADR-0066).
      if (customAction === "TELEGRAM_UZILDI")
        return { label: msg("Telegram uzildi"), icon: Unplug, variant: "destructive" };
      if (customAction === "TELEGRAM_QAYTA_ULANDI")
        return { label: msg("Telegram qayta ulandi"), icon: Plug, variant: "default" };
      // A participation document was issued (the card's «Hujjatlar» tab).
      if (customAction === "QATNASHISH_HUJJATI_BERILDI")
        return { label: msg("Qatnashganlik hujjati berildi"), icon: FileCheck2, variant: "default" };
      // ... and later cancelled (the document stays, the reason is «sabab»).
      if (customAction === "QATNASHISH_HUJJATI_BEKOR_QILINDI")
        return { label: msg("Qatnashganlik hujjati bekor qilindi"), icon: FileX2, variant: "destructive" };
      if (nv?.guruh)
        return { label: msg("Guruhga qo'shildi"), icon: UserPlus, variant: "default" };
      return { label: msg("Yaratildi"), icon: Plus, variant: "default" };

    case "UPDATE":
      // Lead owner (ADR-0093).
      if (customAction === "LID_BAND_QILINDI")
        return { label: msg("Lid band qilindi"), icon: UserCheck, variant: "default" };
      if (customAction === "LID_BERILDI")
        return { label: msg("Lid boshqaga berildi"), icon: ArrowRightLeft, variant: "secondary" };
      if (customAction === "LID_BOSHATILDI")
        return { label: msg("Lid bo'shatildi"), icon: UserMinus, variant: "outline" };
      if (customAction === "LID_QAYTDI")
        return { label: msg("Muddat o'tib qaytdi"), icon: Clock, variant: "destructive" };
      if (customAction === "DAVOMAT_YANGILANDI")
        return { label: msg("Davomat yangilandi"), icon: ClipboardCheck, variant: "secondary" };
      if (customAction === "COMMENT_DELETED")
        return { label: msg("Izoh o'chirildi"), icon: Trash2, variant: "destructive" };
      if (nv && ov && "guruh" in nv)
        return { label: msg("Guruh o'zgartirildi"), icon: ArrowRightLeft, variant: "secondary" };
      return { label: msg("Yangilandi"), icon: Pencil, variant: "secondary" };

    case "DELETE":
      if (customAction === "GURUHDAN_CHIQARILDI" || ov?.guruh)
        return { label: msg("Guruhdan chiqarildi"), icon: UserMinus, variant: "destructive" };
      if (customAction === "OQUVCHI_CHIQARILDI")
        return { label: msg("O'quvchi chiqarildi"), icon: UserMinus, variant: "destructive" };
      if (customAction === "USTOZ_OLIB_TASHLANDI")
        return { label: msg("Ustoz olib tashlandi"), icon: UserMinus, variant: "destructive" };
      if (customAction === "COMMENT_DELETED")
        return { label: msg("Izoh o'chirildi"), icon: Trash2, variant: "destructive" };
      return { label: msg("Arxivlandi"), icon: Trash2, variant: "destructive" };

    case "STATUS_CHANGE":
      if (customAction === "LID_AYLANTIRILDI")
        return { label: msg("O'quvchiga aylantirildi"), icon: GraduationCap, variant: "default" };
      if (customAction === "LID_BIRIKTIRILDI")
        return { label: msg("Mavjud o'quvchiga biriktirildi"), icon: Link2, variant: "default" };
      return { label: msg("Holat o'zgardi"), icon: RefreshCw, variant: "outline" };

    case "RESTORE":
      return { label: msg("Tiklandi"), icon: RotateCcw, variant: "default" };

    default:
      return { label: record.action, icon: Pencil, variant: "outline" };
  }
}

// --- Value formatter ---
export const VALUE_MAX_LENGTH = 80;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

export const VALUE_TRANSLATIONS: Record<string, string> = {
  // Lead statuses
  NEW: msg("Yangi lid"),
  CONTACTED: msg("Aloqaga chiqilgan"),
  TRIAL: msg("Sinov darsida"),
  CONVERTED: msg("O'quvchiga aylantirildi"),
  LOST: msg("Yo'qotilgan"),
  // Group statuses
  FORMING: msg("Boshlanmagan"),
  ACTIVE: msg("Faol"),
  PAUSED: msg("Pauza"),
  COMPLETED: msg("Tugallangan"),
  CANCELLED: msg("To'xtatilgan"),
  ARCHIVED: msg("Arxivlangan"),
  // Student statuses
  FROZEN: msg("Muzlatilgan"),
  INACTIVE: msg("Muzlatilgan"),
  GRADUATED: msg("Bitirgan"),
  EXPELLED: msg("Chetlatilgan"),
  // User statuses
  SUSPENDED: msg("Vaqtincha to'xtatilgan"),
  TERMINATED: msg("Ishdan bo'shatilgan"),
  // Gender
  MALE: msg("Erkak"),
  FEMALE: msg("Ayol"),
  // Enrollment statuses
  DROPPED: msg("Chiqdi"),
  TRANSFERRED: msg("O'tkazildi"),
  // Room statuses
  UNDER_MAINTENANCE: msg("Ta'mirda"),
  // Course statuses
  DEPRECATED: msg("Eskirgan"),
};

export function formatValue(value: unknown, t: Translate = uzbek): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? t("Ha") : t("Yo'q");
  if (typeof value === "string") {
    if (ISO_DATE_RE.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return `${String(d.getDate()).padStart(2, "0")}.${String(
          d.getMonth() + 1,
        ).padStart(2, "0")}.${d.getFullYear()}`;
      }
    }
    if (value in VALUE_TRANSLATIONS) {
      const label = VALUE_TRANSLATIONS[value];
      return t(label);
    }
  }
  return String(value);
}

export function truncateValue(value: unknown, t: Translate = uzbek): {
  text: string;
  truncated: boolean;
} {
  const full = formatValue(value, t);
  if (full.length <= VALUE_MAX_LENGTH) return { text: full, truncated: false };
  return { text: full.slice(0, VALUE_MAX_LENGTH) + "…", truncated: true };
}

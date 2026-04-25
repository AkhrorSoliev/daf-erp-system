import {
  ArrowRightLeft,
  Bot,
  ClipboardCheck,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

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
  firstName: "Ism",
  lastName: "Familiya",
  phone: "Telefon",
  status: "Status",
  name: "Ism",
  login: "Login",
  gender: "Jinsi",
  balance: "Balans",
  mainBranch: "Asosiy filial",
  guruh: "Guruh",
  sabab: "Sabab",
  reason: "Sabab",
  content: "Izoh",
  isActive: "Faolmi",
  photo: "Rasm",
  comment: "Izoh",
  dateOfBirth: "Tug'ilgan sana",
  address: "Manzil",
  telegram: "Telegram",
  extraPhone: "Qo'shimcha telefon",
  parentName: "Ota-ona ismi",
  parentPhone: "Ota-ona telefoni",
  placeOfStudy: "O'qish joyi",
  passportSeries: "Pasport seriyasi",
  // Yashiriladigan texnik field lar
  id: null,
  action: null,
  isTask: null,
  commentId: null,
  companyId: null,
  userId: null,
  telegramChatId: null,
  nomi: "Nomi",
  kunlar: "Kunlar",
  vaqt: "Vaqt",
  boshlanish: "Boshlanish sanasi",
  oquvchi: "O'quvchi",
  ustoz: "Ustoz",
  ustozlar: "Ustozlar",
  startDate: "Boshlanish sanasi",
  endDate: "Tugash sanasi",
  lessonStartTime: "Dars boshlanishi",
  lessonEndTime: "Dars tugashi",
  lessonMinutes: "Dars davomiyligi (daq)",
  level: "Daraja",
  days: "Kunlar",
  exactDays: null,
  roomId: null,
  courseId: null,
  branchId: null,
  groupNumber: "Guruh raqami",
  statusEnum: "Status",
  previousGroupId: null,
  maxStudents: "Maks. o'quvchilar",
  monthlyPayment: "Oylik to'lov",
  capacity: "Sig'imi",
  price: "Narxi",
  description: "Tavsif",
  guruhId: null,
  oquvchiId: null,
  // Davomat tarixi field lari
  sana: "Sana",
  jami: "Jami",
  keldi: "Keldi",
  kelmadi: "Kelmadi",
  kechikdi: "Kechikdi",
  sababli: "Sababli",
};

export function getFieldLabel(key: string): string | null {
  if (key in FIELD_LABELS) return FIELD_LABELS[key];
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
        return { label: "Davomat olindi", icon: ClipboardCheck, variant: "default" };
      if (customAction === "COMMENT_ADDED")
        return { label: "Izoh qo'shildi", icon: MessageSquare, variant: "secondary" };
      if (customAction === "TELEGRAM_ROYXATDAN_OTDI")
        return { label: "Telegram orqali ro'yxatdan o'tdi", icon: Bot, variant: "default" };
      if (customAction === "GURUHGA_QOSHILDI")
        return { label: "Guruhga qo'shildi", icon: UserPlus, variant: "default" };
      if (customAction === "OQUVCHI_QOSHILDI")
        return { label: "O'quvchi qo'shildi", icon: UserPlus, variant: "default" };
      if (customAction === "SMS_YUBORILDI")
        return { label: "SMS yuborildi", icon: MessageSquare, variant: "default" };
      if (customAction === "SMS_YUBORILMADI")
        return { label: "SMS yuborilmadi", icon: MessageSquare, variant: "destructive" };
      if (nv?.guruh)
        return { label: "Guruhga qo'shildi", icon: UserPlus, variant: "default" };
      return { label: "Yaratildi", icon: Plus, variant: "default" };

    case "UPDATE":
      if (customAction === "DAVOMAT_YANGILANDI")
        return { label: "Davomat yangilandi", icon: ClipboardCheck, variant: "secondary" };
      if (customAction === "COMMENT_DELETED")
        return { label: "Izoh o'chirildi", icon: Trash2, variant: "destructive" };
      if (nv && ov && "guruh" in nv)
        return { label: "Guruh o'zgartirildi", icon: ArrowRightLeft, variant: "secondary" };
      return { label: "Yangilandi", icon: Pencil, variant: "secondary" };

    case "DELETE":
      if (customAction === "GURUHDAN_CHIQARILDI" || ov?.guruh)
        return { label: "Guruhdan chiqarildi", icon: UserMinus, variant: "destructive" };
      if (customAction === "OQUVCHI_CHIQARILDI")
        return { label: "O'quvchi chiqarildi", icon: UserMinus, variant: "destructive" };
      if (customAction === "USTOZ_OLIB_TASHLANDI")
        return { label: "Ustoz olib tashlandi", icon: UserMinus, variant: "destructive" };
      if (customAction === "COMMENT_DELETED")
        return { label: "Izoh o'chirildi", icon: Trash2, variant: "destructive" };
      return { label: "Arxivlandi", icon: Trash2, variant: "destructive" };

    case "STATUS_CHANGE":
      return { label: "Status o'zgardi", icon: RefreshCw, variant: "outline" };

    case "RESTORE":
      return { label: "Tiklandi", icon: RotateCcw, variant: "default" };

    default:
      return { label: record.action, icon: Pencil, variant: "outline" };
  }
}

// --- Value formatter ---
export const VALUE_MAX_LENGTH = 80;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

export const VALUE_TRANSLATIONS: Record<string, string> = {
  // Group statuses
  FORMING: "Boshlanmagan",
  ACTIVE: "Faol",
  PAUSED: "Pauza",
  COMPLETED: "Tugallangan",
  CANCELLED: "To'xtatilgan",
  ARCHIVED: "Arxivlangan",
  // Student statuses
  FROZEN: "Muzlatilgan",
  INACTIVE: "Muzlatilgan",
  GRADUATED: "Bitirgan",
  EXPELLED: "Chetlatilgan",
  // User statuses
  SUSPENDED: "To'xtatilgan",
  TERMINATED: "Ishdan bo'shatilgan",
  // Gender
  MALE: "Erkak",
  FEMALE: "Ayol",
  // Enrollment statuses
  DROPPED: "Chiqdi",
  TRANSFERRED: "O'tkazildi",
  // Room statuses
  UNDER_MAINTENANCE: "Ta'mirda",
  // Course statuses
  DEPRECATED: "Eskirgan",
};

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Ha" : "Yo'q";
  if (typeof value === "string") {
    if (ISO_DATE_RE.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return `${String(d.getDate()).padStart(2, "0")}.${String(
          d.getMonth() + 1,
        ).padStart(2, "0")}.${d.getFullYear()}`;
      }
    }
    if (value in VALUE_TRANSLATIONS) return VALUE_TRANSLATIONS[value];
  }
  return String(value);
}

export function truncateValue(value: unknown): {
  text: string;
  truncated: boolean;
} {
  const full = formatValue(value);
  if (full.length <= VALUE_MAX_LENGTH) return { text: full, truncated: false };
  return { text: full.slice(0, VALUE_MAX_LENGTH) + "…", truncated: true };
}

interface StudentBranch {
  id: number;
  name: string;
}

export interface StudentGroup {
  id: string;
  enrollmentId: string;
  name: string;
  status: number;
  level: string | null;
  course_name: string | null;
  days: string | null;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  startDate: string | null;
  endDate: string | null;
  teachers: { id: number; firstName: string; lastName: string }[];
  enrolledAt: string;
}

export interface Student {
  id: number;
  firstName: string;
  lastName: string;
  gender: "MALE" | "FEMALE" | null;
  date_of_birth: string | null;
  phone: string;
  /** The card's number is proved by an SMS code (ADR-0039) — never by Telegram. */
  phoneVerified: boolean;
  /** When it was proved; null while unproved. */
  phoneVerifiedAt: string | null;
  photo: string | null;
  balance: number;
  company_id: number | null;
  deleted_at: string | null;
  destroyer: { id: number; name: string } | null;
  comment: string | null;
  branches: StudentBranch[];
  groups: StudentGroup[];
  balance_on_period: number | null;

  extraPhone: string | null;
  parentPhone: string | null;
  parentName: string | null;
  telegram: string | null;
  telegramChatId: string | null;
  /** The linked chat stopped taking the bot's messages (ADR-0054); null while it takes them. */
  telegramDisconnectedAt: string | null;
  placeOfStudy: string | null;
  address: string | null;
  passportSeries: string | null;
  isActive: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastTransactionType: string | null;
  discountPercent: number;
}

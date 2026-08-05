import { create } from "zustand";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { registerBranchScopedStore } from "@/lib/branch-scoped-stores";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MockExamStatus =
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "GRADING"
  | "ANNOUNCED"
  | "ARCHIVED";

export interface MockExamSection {
  id: string;
  name: string;
  color: string | null;
  order: number;
  examCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MockExamSummary {
  id: string;
  title: string;
  description: string | null;
  status: MockExamStatus;
  sectionId: string;
  examDate: string | null;
  registrationDeadline: string | null;
  durationMinutes: number | null;
  maxScore: number;
  passingScore: number | null;
  price: number;
  // Discounted mock fee for DaF students (null = they pay the full price).
  studentPrice: number | null;
  // CEFR levels the exam offers (empty = no level step in the bot).
  offeredLevels: string[];
  // Time slots ("HH:mm") offered on examDate (empty/single = no time step).
  examTimes: string[];
  botStartPayload: string;
  participantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MockExamRow extends MockExamSummary {
  section: { id: string; name: string; color: string | null };
}

interface BoardState {
  sections: MockExamSection[];
  exams: MockExamRow[];
  loading: boolean;
  loaded: boolean;
  fetch: () => Promise<void>;
  // Section mutations
  addSection: (section: MockExamSection) => void;
  updateSection: (
    id: string,
    patch: Partial<Pick<MockExamSection, "name" | "color">>,
  ) => void;
  removeSection: (id: string) => void;
  reorderSections: (orderedIds: string[]) => Promise<void>;
  // Exam mutations
  addExam: (exam: MockExamRow) => void;
  updateExam: (exam: MockExamRow | MockExamSummary) => void;
  removeExam: (examId: string) => void;
}

async function fetchSections(): Promise<MockExamSection[]> {
  const { data } = await api.get<MockExamSection[]>("/mock-exam-sections");
  return data;
}

async function fetchExams(): Promise<MockExamRow[]> {
  const { data } = await api.get<MockExamRow[]>("/mock-exams");
  return data;
}

export const useMockExamsBoard = create<BoardState>((set, get) => ({
  sections: [],
  exams: [],
  loading: false,
  loaded: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const [sections, exams] = await Promise.all([
        fetchSections(),
        fetchExams(),
      ]);
      set({ sections, exams, loading: false, loaded: true });
    } catch (error) {
      set({ loading: false });
      toast.error(getErrorMessage(error, "Yuklashda xatolik"));
    }
  },

  addSection: (section) => {
    set((s) => ({
      sections: [...s.sections, section].sort((a, b) => a.order - b.order),
    }));
  },

  updateSection: (id, patch) => {
    set((s) => ({
      sections: s.sections.map((sec) =>
        sec.id === id ? { ...sec, ...patch } : sec,
      ),
      // Also refresh the inline section info on each exam row.
      exams: s.exams.map((e) =>
        e.section.id === id
          ? {
              ...e,
              section: {
                ...e.section,
                ...(patch.name !== undefined ? { name: patch.name } : {}),
                ...(patch.color !== undefined ? { color: patch.color } : {}),
              },
            }
          : e,
      ),
    }));
  },

  removeSection: (id) => {
    set((s) => ({ sections: s.sections.filter((sec) => sec.id !== id) }));
  },

  reorderSections: async (orderedIds) => {
    const original = get().sections;
    const byId = new Map(original.map((s) => [s.id, s]));
    const reordered = orderedIds
      .map((id, index) => {
        const sec = byId.get(id);
        return sec ? { ...sec, order: index } : null;
      })
      .filter((s): s is MockExamSection => s !== null);
    set({ sections: reordered });
    try {
      await api.patch("/mock-exam-sections/reorder", {
        sectionIds: orderedIds,
      });
    } catch (error) {
      set({ sections: original });
      toast.error(getErrorMessage(error, "Tartibni saqlashda xatolik"));
    }
  },

  addExam: (exam) => {
    set((s) => ({
      exams: [exam, ...s.exams],
      sections: s.sections.map((sec) =>
        sec.id === exam.sectionId
          ? { ...sec, examCount: sec.examCount + 1 }
          : sec,
      ),
    }));
  },

  updateExam: (exam) => {
    set((s) => ({
      exams: s.exams.map((e) => {
        if (e.id !== exam.id) return e;
        // The summary form doesn't carry section info — preserve it.
        const next: MockExamRow = {
          ...e,
          ...exam,
          section:
            "section" in exam && exam.section
              ? exam.section
              : e.section,
        };
        return next;
      }),
    }));
  },

  removeExam: (examId) => {
    set((s) => {
      const removed = s.exams.find((e) => e.id === examId);
      return {
        exams: s.exams.filter((e) => e.id !== examId),
        sections: removed
          ? s.sections.map((sec) =>
              sec.id === removed.sectionId
                ? { ...sec, examCount: Math.max(0, sec.examCount - 1) }
                : sec,
            )
          : s.sections,
      };
    });
  },
}));

// ---------------------------------------------------------------------------
// Status display helpers
// ---------------------------------------------------------------------------

export const MOCK_EXAM_STATUS_LABELS: Record<MockExamStatus, string> = {
  REGISTRATION_OPEN: "Ro'yxat ochiq",
  REGISTRATION_CLOSED: "Ro'yxat yopiq",
  GRADING: "Baholanmoqda",
  ANNOUNCED: "E'lon qilingan",
  ARCHIVED: "Arxivlangan",
};

export const MOCK_EXAM_STATUS_COLORS: Record<MockExamStatus, string> = {
  REGISTRATION_OPEN:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  REGISTRATION_CLOSED:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  GRADING: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  ANNOUNCED:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
  ARCHIVED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

/**
 * Allowed forward + backward transitions. Mirrors the backend's
 * mock-exam-status.util.ts — keep in sync.
 */
export const MOCK_EXAM_TRANSITIONS: Record<MockExamStatus, MockExamStatus[]> = {
  REGISTRATION_OPEN: ["REGISTRATION_CLOSED"],
  REGISTRATION_CLOSED: ["GRADING", "REGISTRATION_OPEN"],
  GRADING: ["ANNOUNCED", "REGISTRATION_CLOSED"],
  ANNOUNCED: ["ARCHIVED"],
  ARCHIVED: [],
};

/**
 * Rich descriptor for each transition — the dropdown uses this to render
 * an action verb (not a passive status name), a one-line explanation of
 * what happens, an icon hint, and a destructive flag for rollbacks.
 *
 * `requiresConfirm: true` flags transitions that send notifications or
 * are otherwise hard to undo — the UI must wrap them with a confirm
 * dialog.
 */
export type MockExamTransitionKind =
  | "forward"
  | "rollback"
  | "announce"
  | "archive";

export interface MockExamTransitionInfo {
  label: string;
  description: string;
  kind: MockExamTransitionKind;
  destructive?: boolean;
  requiresConfirm?: boolean;
}

export const MOCK_EXAM_TRANSITION_INFO: Record<
  MockExamStatus,
  Partial<Record<MockExamStatus, MockExamTransitionInfo>>
> = {
  REGISTRATION_OPEN: {
    REGISTRATION_CLOSED: {
      label: "Ro'yxatni yopish",
      description:
        "Yangi ro'yxatga olishlar to'xtaydi. Mavjud ishtirokchilar saqlanib qoladi.",
      kind: "forward",
    },
  },
  REGISTRATION_CLOSED: {
    GRADING: {
      label: "Baholashni boshlash",
      description:
        "Ishtirokchilarga ballar kiritish bo'limi ochiladi. Yangi ishtirokchi qo'shib bo'lmaydi.",
      kind: "forward",
    },
    REGISTRATION_OPEN: {
      label: "Ro'yxatni qayta ochish",
      description: "Ishtirokchilar yana ro'yxatdan o'ta oladi.",
      kind: "rollback",
      destructive: true,
    },
  },
  GRADING: {
    ANNOUNCED: {
      label: "Natijalarni e'lon qilish",
      description:
        "PDF avtomatik yaratiladi va Telegram orqali ishtirokchilarga yuboriladi. Bekor qilib bo'lmaydi.",
      kind: "announce",
      requiresConfirm: true,
    },
    REGISTRATION_CLOSED: {
      label: "Baholashni to'xtatish",
      description: "Kiritilgan ballar saqlanadi, baholashni keyin davom ettirish mumkin.",
      kind: "rollback",
      destructive: true,
    },
  },
  ANNOUNCED: {
    ARCHIVED: {
      label: "Arxivga ko'chirish",
      description:
        "Imtihon yopiladi va ro'yxat sahifasida ko'rinmaydi. Tahrirlash mumkin emas.",
      kind: "archive",
      requiresConfirm: true,
    },
  },
  ARCHIVED: {},
};

// A mock exam belongs to the branch it is HELD in, and mock revenue is never
// written to the ledger — the exam row is the only record of which branch
// earned it. The store's own `loaded` flag would otherwise keep the previous
// branch's exams on screen after a switch. See `lib/branch-scoped-stores.ts`.
registerBranchScopedStore(useMockExamsBoard);

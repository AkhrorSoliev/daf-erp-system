"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardList,
  FileDown,
  Info,
  Loader2,
  Pencil,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import {
  MOCK_EXAM_TRANSITIONS,
  MOCK_EXAM_TRANSITION_INFO,
  useMockExamsBoard,
  useMockExamsBoardTranslator,
  type MockExamStatus,
  type MockExamTransitionInfo,
} from "@/hooks/use-mock-exams-board";
import { EditExamDrawer } from "./edit-exam-drawer";
import { ShareLinkDialog } from "./share-link-dialog";
import { ExamOverviewTab } from "./exam-overview-tab";
import { ExamParticipantsTab } from "./exam-participants-tab";
import { ExamResultsTab } from "./exam-results-tab";
import { ExamStatusStepper } from "./exam-status-stepper";
import type { ExamDetail } from "./exam-detail-types";

interface ExamDetailClientProps {
  examId: string;
}

const DEFAULT_TAB = "ishtirokchilar";
const VALID_TABS = new Set(["overview", "ishtirokchilar", "natijalar"]);

export function ExamDetailClient({ examId }: ExamDetailClientProps) {
  const t = useT();
  useMockExamsBoardTranslator();
  // The load effect reads t from here: a language switch must not refetch.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setBreadcrumbName = useBreadcrumbName((s) => s.setName);
  const updateExam = useMockExamsBoard((s) => s.updateExam);
  const removeExam = useMockExamsBoard((s) => s.removeExam);

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<{
    next: MockExamStatus;
    info: MockExamTransitionInfo;
  } | null>(null);

  const tabParam = searchParams.get("tab") ?? DEFAULT_TAB;
  const activeTab = VALID_TABS.has(tabParam) ? tabParam : DEFAULT_TAB;

  const handleTabChange = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === DEFAULT_TAB) {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ExamDetail>(`/mock-exams/${examId}`)
      .then(({ data }) => {
        if (!cancelled) {
          setExam(data);
          setBreadcrumbName(examId, data.title);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const t = tRef.current;
          toast.error(getErrorMessage(error, t("Imtihonni yuklashda xatolik")));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, setBreadcrumbName]);

  async function handleStatus(next: MockExamStatus) {
    if (!exam) return;
    setStatusBusy(true);
    try {
      const { data } = await api.patch<ExamDetail>(
        `/mock-exams/${exam.id}/status`,
        { status: next },
      );
      // Backend status update doesn't include subjects in its query —
      // preserve the locally-loaded subjects so the bo'limlar tab keeps its
      // data after a status flip.
      setExam((prev) =>
        prev ? { ...data, subjects: prev.subjects } : data,
      );
      updateExam(data);
      toast.success(t("Holat o'zgartirildi"));
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("Holatni o'zgartirishda xatolik")),
      );
    } finally {
      setStatusBusy(false);
    }
  }

  /**
   * Eski imtihon: e'lon qilingan, lekin PDF yaratilmay qolgan (ilgari PDF
   * xatosi e'lonni to'xtatmasdi) — natijalar hech kimga yuborilmagan. PDF'ni
   * yaratib, tarqatishni qayta ishga tushiradi.
   */
  async function handleRetryResults() {
    if (!exam) return;
    setRetryBusy(true);
    try {
      const { data } = await api.post<{ url: string }>(
        `/mock-exams/${exam.id}/regenerate-pdf`,
      );
      setExam((prev) => (prev ? { ...prev, resultsPdfUrl: data.url } : prev));
      await api.post(`/mock-exams/${exam.id}/rebroadcast-results`);
      toast.success(t("PDF yaratildi, natijalar ishtirokchilarga yuborilmoqda"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("PDF yaratishda xatolik")));
    } finally {
      setRetryBusy(false);
    }
  }

  async function handleDelete() {
    if (!exam) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/mock-exams/${exam.id}`);
      removeExam(exam.id);
      toast.success(t("Imtihon o'chirildi"));
      router.push("/mock-exams");
    } catch (error) {
      toast.error(getErrorMessage(error, t("O'chirishda xatolik")));
      setDeleteBusy(false);
    }
  }

  const handleParticipantCountChange = useCallback((delta: number) => {
    setExam((prev) =>
      prev
        ? { ...prev, participantCount: Math.max(0, prev.participantCount + delta) }
        : prev,
    );
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">{t("Imtihon topilmadi")}</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/mock-exams">
            <ArrowLeft className="size-4" />
            {t("Orqaga")}
          </Link>
        </Button>
      </div>
    );
  }

  const allowed = MOCK_EXAM_TRANSITIONS[exam.status];
  const forwardStatus = allowed.find(
    (s) => MOCK_EXAM_TRANSITION_INFO[exam.status][s]?.kind !== "rollback",
  );
  const rollbackStatus = allowed.find(
    (s) => MOCK_EXAM_TRANSITION_INFO[exam.status][s]?.kind === "rollback",
  );

  function triggerTransition(next: MockExamStatus) {
    const info = MOCK_EXAM_TRANSITION_INFO[exam!.status][next];
    if (!info) return;
    if (info.requiresConfirm) {
      setPendingTransition({ next, info });
    } else {
      void handleStatus(next);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold leading-tight">
            {exam.title}
          </h1>
          {exam.description && (
            <p className="text-sm text-muted-foreground">{exam.description}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="size-4" />
            {t("Ulashish")}
          </Button>

          {exam.status === "ANNOUNCED" && !exam.resultsPdfUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetryResults}
              disabled={retryBusy}
              title={t(
                "E'lon qilingan, lekin natijalar PDF'i yaratilmagan — yaratib, ishtirokchilarga yuborish",
              )}
            >
              {retryBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" />
              )}
              {t("PDF yaratib yuborish")}
            </Button>
          )}

          {exam.resultsPdfUrl && (
            <Button
              size="sm"
              variant="outline"
              asChild
              title={t("Natijalar PDFini yangi yorliqda ochish")}
            >
              <a
                href={exam.resultsPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileDown className="size-4" />
                PDF
              </a>
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-4" />
            {t("Tahrirlash")}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            {t("O'chirish")}
          </Button>
        </div>
      </div>

      <ExamStatusStepper
        status={exam.status}
        busy={statusBusy}
        onAdvance={() => forwardStatus && triggerTransition(forwardStatus)}
        onRollback={() => rollbackStatus && triggerTransition(rollbackStatus)}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">
            <Info className="mr-1.5 size-4" />
            {t("Umumiy")}
          </TabsTrigger>
          <TabsTrigger value="ishtirokchilar">
            <Users className="mr-1.5 size-4" />
            {t("Ishtirokchilar ({n})", { n: exam.participantCount })}
          </TabsTrigger>
          <TabsTrigger value="natijalar">
            <ClipboardList className="mr-1.5 size-4" />
            {t("Natijalar")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6">
          <ExamOverviewTab exam={exam} onShare={() => setShareOpen(true)} />
        </TabsContent>
        <TabsContent value="ishtirokchilar" className="mt-6">
          <ExamParticipantsTab
            exam={exam}
            onParticipantCountChange={handleParticipantCountChange}
          />
        </TabsContent>
        <TabsContent value="natijalar" className="mt-6">
          <ExamResultsTab exam={exam} />
        </TabsContent>
      </Tabs>

      <EditExamDrawer
        exam={editOpen ? exam : null}
        onClose={() => setEditOpen(false)}
        onSaved={(next) => {
          setExam((prev) =>
            prev ? { ...prev, ...next, subjects: prev.subjects } : prev,
          );
          updateExam(next);
          setEditOpen(false);
        }}
      />

      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        examTitle={exam.title}
        botStartPayload={exam.botStartPayload}
        registrationOpen={exam.status === "REGISTRATION_OPEN"}
      />

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(o) => !o && !deleteBusy && setDeleteOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Imtihonni o'chirish")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "\"{title}\" imtihoni o'chiriladi. Ishtirokchilar va natijalar ham arxivlanadi (yo'qotilmaydi), ularning to'lov havolalari ishlamay qoladi. To'lagan ishtirokchi bo'lsa, avval ularni «Ishtirokchilar» bo'limidan pul qaytarilganini tasdiqlab o'chiring.",
                { title: exam.title },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>
              {t("Bekor qilish")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteBusy}
              variant="destructive"
            >
              {deleteBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("O'chirish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingTransition}
        onOpenChange={(o) =>
          !o && !statusBusy && setPendingTransition(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTransition && t(pendingTransition.info.label)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTransition && t(pendingTransition.info.description)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusBusy}>
              {t("Bekor qilish")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingTransition) return;
                await handleStatus(pendingTransition.next);
                setPendingTransition(null);
              }}
              disabled={statusBusy}
              variant={pendingTransition?.info.destructive ? "destructive" : "default"}
            >
              {statusBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("Tasdiqlash")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import toast from "react-hot-toast";
import {
  ArrowRightLeft,
  GraduationCap,
  Loader2,
  Pencil,
  PhoneCall,
  Trash2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CommentForm } from "@/components/shared/comment-form";
import {
  CommentList,
  type CommentData,
} from "@/components/shared/comment-list";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhone } from "@/lib/format-utils";
import {
  LEAD_STATUS_LABELS,
  leadConvertedLabel,
  useLeadsBoard,
  type LeadCard,
  type LeadStatus,
} from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { useLeadActivity } from "@/hooks/use-lead-activity";
import { useAuth } from "@/hooks/use-auth";
import type { FormFieldShape } from "@/lib/schemas/custom-form-schema";

interface LeadFormSubmission {
  id: string;
  data: Record<string, unknown>;
  submittedAt: string;
  form: { id: string; title: string; fields: FormFieldShape[] };
}

interface LeadMockParticipation {
  id: string;
  publicId: number;
  paid: boolean;
  registeredAt: string;
  totalScore: number | null;
  exam: {
    id: string;
    title: string;
    status: string;
    examDate: string | null;
    section: { name: string; color: string | null };
  };
}

interface LeadDetail {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  statusEnum: LeadStatus;
  convertedStudentId: number | null;
  statusChangeReason: string | null;
  createdAt: string;
  calledAt: string | null;
  calledBy: { id: number; firstName: string; lastName: string } | null;
  source: { id: string; name: string } | null;
  section: {
    id: string;
    name: string;
    column: { id: string; name: string };
  } | null;
  formSubmissions: LeadFormSubmission[];
  mockParticipations: LeadMockParticipation[];
  // A live student that already holds this lead's phone, if any. Surfaced so the
  // admin links to the existing account instead of creating a duplicate.
  matchedStudent: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string;
    status: string;
  } | null;
}

const STUDENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Faol",
  FROZEN: "Muzlatilgan",
  GRADUATED: "Bitirgan",
  EXPELLED: "Chetlatilgan",
  ARCHIVED: "Arxivlangan",
};

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

const MOCK_EXAM_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Qoralama",
  REGISTRATION_OPEN: "Ro'yxat ochiq",
  REGISTRATION_CLOSED: "Ro'yxat yopiq",
  GRADING: "Baholanmoqda",
  ANNOUNCED: "E'lon qilingan",
  ARCHIVED: "Arxivlangan",
};

function MockParticipationsBlock({
  participations,
}: {
  participations: LeadMockParticipation[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold">🎯 Mock imtihonlarga yozilgan</h4>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {participations.length}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Bu lid telefon raqami orqali quyidagi mock imtihonlarga ro&apos;yxatga
        olingan
      </p>
      <ul className="space-y-2">
        {participations.map((p) => (
          <li
            key={p.id}
            className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-3"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{p.exam.title}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px]"
                  style={{
                    backgroundColor: `${p.exam.section.color ?? "#94a3b8"}20`,
                    color: p.exam.section.color ?? "#475569",
                  }}
                >
                  {p.exam.section.name}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>🆔 #{p.publicId}</span>
                <span>
                  📅{" "}
                  {p.exam.examDate
                    ? format(parseISO(p.exam.examDate), "dd.MM.yyyy")
                    : "sanasi yo'q"}
                </span>
                <span>
                  Yozildi:{" "}
                  {format(parseISO(p.registeredAt), "dd.MM.yyyy")}
                </span>
                {p.paid ? (
                  <span className="text-emerald-600">✓ To&apos;langan</span>
                ) : (
                  <span className="text-amber-600">To&apos;lov kutilmoqda</span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs">
              <div className="text-muted-foreground">
                {MOCK_EXAM_STATUS_LABELS[p.exam.status] ?? p.exam.status}
              </div>
              {p.totalScore !== null && (
                <div className="mt-1 font-medium tabular-nums">
                  {p.totalScore} ball
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormSubmissionsBlock({
  submissions,
}: {
  submissions: LeadFormSubmission[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold">Forma orqali kelgan</h4>
      </div>
      {submissions.map((sub) => {
        const fieldLabels = new Map(sub.form.fields.map((f) => [f.id, f]));
        const entries = Object.entries(sub.data).filter(
          ([key]) => fieldLabels.get(key)?.mapsTo == null,
        );
        return (
          <div
            key={sub.id}
            className="space-y-2 rounded-md border bg-muted/30 p-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium">{sub.form.title}</span>
              <span className="text-[11px] text-muted-foreground">
                {format(parseISO(sub.submittedAt), "dd.MM.yyyy")}
              </span>
            </div>
            {entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Qo&apos;shimcha javoblar yo&apos;q
              </p>
            ) : (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-xs">
                {entries.map(([key, value]) => {
                  const field = fieldLabels.get(key);
                  return (
                    <FormSubmissionEntry
                      key={key}
                      label={field?.label ?? key}
                      value={value}
                    />
                  );
                })}
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FormSubmissionEntry({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  let display: string;
  if (value === null || value === undefined || value === "") display = "—";
  else if (typeof value === "boolean") display = value ? "Ha" : "Yo'q";
  else display = String(value);
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{display}</dd>
    </>
  );
}

export function LeadDetailDrawer() {
  const leadId = useLeadsUi((s) => s.detailLeadId);
  const closeLeadDetail = useLeadsUi((s) => s.closeLeadDetail);
  const openEditLead = useLeadsUi((s) => s.openEditLead);
  const openMoveLead = useLeadsUi((s) => s.openMoveLead);
  const openDelete = useLeadsUi((s) => s.openDelete);
  const openConvertLead = useLeadsUi((s) => s.openConvertLead);
  const applyLeadUpdate = useLeadsBoard((s) => s.applyLeadUpdate);
  const applyLeadRemove = useLeadsBoard((s) => s.applyLeadRemove);
  const bumpLeadCommentCount = useLeadsBoard((s) => s.bumpLeadCommentCount);
  const detailLeadTab = useLeadsUi((s) => s.detailLeadTab);
  const clearDetailLeadTab = useLeadsUi((s) => s.clearDetailLeadTab);
  const invalidateActivity = useLeadActivity((s) => s.invalidate);
  const authUser = useAuth((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Drawer-scoped tab. Uses its own `?lead_tab=` param so it never clashes with
  // the leads board's own URL state; cleared when the drawer closes.
  const tab = searchParams.get("lead_tab") ?? "malumot";

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [linking, setLinking] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<CommentData[]>(
    [],
  );

  const setTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "malumot") {
        params.delete("lead_tab");
      } else {
        params.set("lead_tab", value);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // One-shot: when the drawer is opened straight onto a tab (e.g. the card's
  // comment icon requests "izohlar"), apply it once and clear the intent so a
  // later manual tab switch isn't forced back.
  useEffect(() => {
    if (leadId && detailLeadTab) {
      setTab(detailLeadTab);
      clearDetailLeadTab();
    }
  }, [leadId, detailLeadTab, setTab, clearDetailLeadTab]);

  const handleCloseDetail = useCallback(() => {
    closeLeadDetail();
    if (searchParams.has("lead_tab")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("lead_tab");
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  }, [closeLeadDetail, pathname, router, searchParams]);

  // Attach the lead to the already-existing phone-matched student instead of
  // creating a duplicate. The lead becomes CONVERTED and leaves the board.
  const handleLinkToStudent = useCallback(async () => {
    if (!lead?.matchedStudent) return;
    setLinking(true);
    try {
      await api.post(`/leads/${lead.id}/convert`, {
        existingStudentId: lead.matchedStudent.id,
      });
      if (lead.section) applyLeadRemove(lead.section.id, lead.id);
      toast.success("Lid mavjud o'quvchiga bog'landi");
      handleCloseDetail();
    } catch (error) {
      toast.error(getErrorMessage(error, "Bog'lashda xatolik yuz berdi"));
    } finally {
      setLinking(false);
    }
  }, [lead, applyLeadRemove, handleCloseDetail]);

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    setLoading(true);
    setLead(null);
    setOptimisticComments([]);
    api
      .get<LeadDetail>(`/leads/${leadId}`)
      .then(({ data }) => {
        if (!cancelled) setLead(data);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(getErrorMessage(error, "Lidni yuklashda xatolik"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const handleOptimisticAdd = useCallback((comment: CommentData) => {
    setOptimisticComments((prev) => [comment, ...prev]);
  }, []);

  const handleCommentConfirmed = useCallback(
    (tempId: string) => {
      setOptimisticComments((prev) => prev.filter((c) => c.id !== tempId));
      if (!lead) return;
      // Keep the board card's comment icon/count in sync without a refetch.
      if (lead.section) bumpLeadCommentCount(lead.section.id, lead.id, 1);
      // Drop the cached hover preview so the next hover shows this new comment.
      invalidateActivity(lead.id);
    },
    [lead, bumpLeadCommentCount, invalidateActivity],
  );

  const handleToggleCalled = useCallback(async () => {
    if (!lead) return;
    const next = !lead.calledAt;
    setMarking(true);
    try {
      const { data } = await api.patch<LeadCard>(`/leads/${lead.id}/called`, {
        called: next,
      });
      // Marking on credits the current user as the caller; clearing removes it.
      const nextCalledBy =
        next && authUser
          ? {
              id: authUser.id,
              firstName: authUser.firstName,
              lastName: authUser.lastName,
            }
          : null;
      setLead((prev) =>
        prev
          ? { ...prev, calledAt: data.calledAt, calledBy: nextCalledBy }
          : prev,
      );
      // Reflect the new state on the board card immediately.
      if (lead.section) applyLeadUpdate(lead.section.id, data);
      // Drop the cached hover preview so the next hover reflects the change.
      invalidateActivity(lead.id);
      toast.success(
        next
          ? "Telefon qilindi deb belgilandi"
          : "Telefon belgisi olib tashlandi",
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
    } finally {
      setMarking(false);
    }
  }, [lead, applyLeadUpdate, invalidateActivity, authUser]);

  const handleCommentFailed = useCallback((tempId: string) => {
    setOptimisticComments((prev) =>
      prev.map((c) =>
        c.id === tempId ? { ...c, _pending: false, _failed: true } : c,
      ),
    );
  }, []);

  // Fired by CommentList after a successful delete — mirror the add path so the
  // board card count and the hover-summary cache don't go stale.
  const handleCommentDeleted = useCallback(() => {
    if (!lead) return;
    if (lead.section) bumpLeadCommentCount(lead.section.id, lead.id, -1);
    invalidateActivity(lead.id);
  }, [lead, bumpLeadCommentCount, invalidateActivity]);

  return (
    <Sheet open={!!leadId} onOpenChange={(o) => !o && handleCloseDetail()}>
      <SheetContent
        side="right"
        className="flex flex-col overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">Lid ma&apos;lumotlari</SheetTitle>
          <SheetDescription>
            Potensial o&apos;quvchi haqida to&apos;liq ma&apos;lumot
          </SheetDescription>
        </SheetHeader>

        {loading || !lead ? (
          <div className="flex-1 space-y-4 px-6 py-5">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <TabsList className="mx-6 mt-3 grid w-auto grid-cols-3">
              <TabsTrigger value="malumot">Ma&apos;lumot</TabsTrigger>
              <TabsTrigger value="izohlar">Izohlar</TabsTrigger>
              <TabsTrigger value="tarix">Tarix</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <TabsContent value="malumot" className="mt-0 space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">
                    {lead.firstName} {lead.lastName}
                  </h3>
                  <Badge variant="secondary">
                    {LEAD_STATUS_LABELS[lead.statusEnum]}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <DetailRow label="Telefon" value={formatPhone(lead.phone)} />
                  <DetailRow label="Manba" value={lead.source?.name} />
                  <DetailRow
                    label="Joylashuvi"
                    value={
                      lead.section
                        ? `${lead.section.column.name} › ${lead.section.name}`
                        : null
                    }
                  />
                  <DetailRow
                    label="Qo'shilgan sana"
                    value={format(parseISO(lead.createdAt), "dd.MM.yyyy")}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Telefon holati</p>
                    {lead.calledAt ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <PhoneCall className="size-3.5 shrink-0" />
                        <span>
                          Telefon qilingan ·{" "}
                          {format(
                            parseISO(lead.calledAt),
                            "dd.MM.yyyy, HH:mm",
                          )}
                          {lead.calledBy
                            ? ` · ${lead.calledBy.firstName} ${lead.calledBy.lastName}`
                            : ""}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Hali telefon qilinmagan
                      </p>
                    )}
                  </div>
                  <Button
                    variant={lead.calledAt ? "outline" : "default"}
                    size="sm"
                    className="shrink-0"
                    onClick={handleToggleCalled}
                    disabled={marking}
                  >
                    {marking ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <PhoneCall className="size-4" />
                    )}
                    {lead.calledAt ? "Bekor qilish" : "Telefon qilindi"}
                  </Button>
                </div>

                {lead.mockParticipations.length > 0 && (
                  <MockParticipationsBlock
                    participations={lead.mockParticipations}
                  />
                )}

                {lead.formSubmissions.length > 0 && (
                  <FormSubmissionsBlock submissions={lead.formSubmissions} />
                )}

                {lead.statusEnum === "CONVERTED" &&
                lead.convertedStudentId ? (
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-sm font-medium">
                      {leadConvertedLabel(
                        lead.statusEnum,
                        lead.statusChangeReason,
                      )}
                    </p>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-sm"
                      onClick={() =>
                        router.push(
                          `/students/profile/${lead.convertedStudentId}`,
                        )
                      }
                    >
                      O&apos;quvchi sahifasini ochish →
                    </Button>
                  </div>
                ) : lead.matchedStudent ? (
                  <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800/60 dark:bg-amber-950/30">
                    <div>
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                        Bu telefon bilan o&apos;quvchi allaqachon mavjud
                      </p>
                      <p className="mt-1 text-sm">
                        {lead.matchedStudent.firstName}{" "}
                        {lead.matchedStudent.lastName}{" "}
                        <span className="text-muted-foreground">
                          #{lead.matchedStudent.id} ·{" "}
                          {STUDENT_STATUS_LABELS[lead.matchedStudent.status] ??
                            lead.matchedStudent.status}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Dublikat oldini olish uchun yangi akkaunt yaratilmaydi —
                        mavjud o&apos;quvchiga bog&apos;lang.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          router.push(
                            `/students/profile/${lead.matchedStudent!.id}`,
                          )
                        }
                      >
                        <GraduationCap className="size-4" />
                        Profilni ochish
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleLinkToStudent}
                        disabled={linking}
                      >
                        {linking ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Shu o&apos;quvchiga bog&apos;lash
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      openConvertLead({
                        id: lead.id,
                        sectionId: lead.section?.id ?? "",
                      });
                      handleCloseDetail();
                    }}
                  >
                    <GraduationCap className="size-4" />
                    O&apos;quvchiga aylantirish
                  </Button>
                )}
              </TabsContent>

              <TabsContent value="izohlar" className="mt-0 space-y-4">
                <CommentForm
                  entityType="Lead"
                  entityId={lead.id}
                  onOptimisticAdd={handleOptimisticAdd}
                  onConfirmed={handleCommentConfirmed}
                  onFailed={handleCommentFailed}
                />
                <CommentList
                  entityType="Lead"
                  entityId={lead.id}
                  optimisticComments={optimisticComments}
                  onCommentChange={handleCommentDeleted}
                />
              </TabsContent>

              <TabsContent value="tarix" className="mt-0">
                <EntityHistoryTable entityType="Lead" entityId={lead.id} />
              </TabsContent>
            </div>
          </Tabs>
        )}

        {lead && (
          <SheetFooter className="border-t px-6 py-4">
            <div className="flex w-full items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  openDelete({
                    kind: "lead",
                    id: lead.id,
                    name: `${lead.firstName} ${lead.lastName}`,
                    sectionId: lead.section?.id ?? "",
                  });
                  handleCloseDetail();
                }}
              >
                <Trash2 className="size-4" />
                O&apos;chirish
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    openMoveLead({
                      id: lead.id,
                      sectionId: lead.section?.id ?? "",
                    });
                    handleCloseDetail();
                  }}
                >
                  <ArrowRightLeft className="size-4" />
                  Ko&apos;chirish
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    openEditLead({
                      id: lead.id,
                      sectionId: lead.section?.id ?? "",
                      firstName: lead.firstName,
                      lastName: lead.lastName,
                      phone: lead.phone,
                      sourceId: lead.source?.id ?? "",
                    });
                    handleCloseDetail();
                  }}
                >
                  <Pencil className="size-4" />
                  Tahrirlash
                </Button>
              </div>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

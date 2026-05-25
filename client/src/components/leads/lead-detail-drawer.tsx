"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import toast from "react-hot-toast";
import { ArrowRightLeft, GraduationCap, Pencil, Trash2 } from "lucide-react";
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
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import type { FormFieldShape } from "@/lib/schemas/custom-form-schema";

interface LeadFormSubmission {
  id: string;
  data: Record<string, unknown>;
  submittedAt: string;
  form: { id: string; title: string; fields: FormFieldShape[] };
}

interface LeadDetail {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  statusEnum: LeadStatus;
  convertedStudentId: number | null;
  createdAt: string;
  source: { id: string; name: string } | null;
  section: {
    id: string;
    name: string;
    column: { id: string; name: string };
  } | null;
  formSubmissions: LeadFormSubmission[];
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value || "—"}</span>
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
  const router = useRouter();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("malumot");
  const [optimisticComments, setOptimisticComments] = useState<CommentData[]>(
    [],
  );

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    setLoading(true);
    setLead(null);
    setTab("malumot");
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

  const handleCommentConfirmed = useCallback((tempId: string) => {
    setOptimisticComments((prev) => prev.filter((c) => c.id !== tempId));
  }, []);

  const handleCommentFailed = useCallback((tempId: string) => {
    setOptimisticComments((prev) =>
      prev.map((c) =>
        c.id === tempId ? { ...c, _pending: false, _failed: true } : c,
      ),
    );
  }, []);

  return (
    <Sheet open={!!leadId} onOpenChange={(o) => !o && closeLeadDetail()}>
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

                {lead.formSubmissions.length > 0 && (
                  <FormSubmissionsBlock submissions={lead.formSubmissions} />
                )}

                {lead.statusEnum === "CONVERTED" &&
                lead.convertedStudentId ? (
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-sm font-medium">
                      O&apos;quvchiga aylantirilgan
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
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      openConvertLead({
                        id: lead.id,
                        sectionId: lead.section?.id ?? "",
                      });
                      closeLeadDetail();
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
                  closeLeadDetail();
                }}
              >
                <Trash2 className="size-4" />
                O&apos;chirish
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    openMoveLead({
                      id: lead.id,
                      sectionId: lead.section?.id ?? "",
                    })
                  }
                >
                  <ArrowRightLeft className="size-4" />
                  Ko&apos;chirish
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    openEditLead({
                      id: lead.id,
                      sectionId: lead.section?.id ?? "",
                      firstName: lead.firstName,
                      lastName: lead.lastName,
                      phone: lead.phone,
                      sourceId: lead.source?.id ?? "",
                    })
                  }
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

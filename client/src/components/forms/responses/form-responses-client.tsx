"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import type { CustomFormDetail } from "@/hooks/use-custom-forms";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { ConvertLeadDialog } from "@/components/leads/convert-lead-dialog";
import { DeleteConfirmDialog } from "@/components/leads/delete-confirm-dialog";
import { EditLeadDrawer } from "@/components/leads/edit-lead-drawer";
import { LeadDetailDrawer } from "@/components/leads/lead-detail-drawer";
import { MoveLeadDialog } from "@/components/leads/move-lead-dialog";
import {
  RestoreLeadDialog,
  type RestoreLeadTarget,
} from "@/components/leads/restore-lead-dialog";
import { FormResponsesBody } from "./form-responses-body";
import { ResponsesHeader } from "./responses-header";
import type { SubmissionRow } from "./types";
import { useFormSubmissions } from "./use-form-submissions";

export function FormResponsesClient({ formId }: { formId: string }) {
  const router = useRouter();
  const setName = useBreadcrumbName((s) => s.setName);
  const [form, setForm] = useState<CustomFormDetail | null>(null);
  const submissions = useFormSubmissions(formId);
  const { refetch } = submissions;

  const board = useLeadsBoard((s) => s.board);
  const fetchBoard = useLeadsBoard((s) => s.fetchBoard);
  const openLeadDetail = useLeadsUi((s) => s.openLeadDetail);
  const [restoreTarget, setRestoreTarget] = useState<RestoreLeadTarget | null>(null);

  useEffect(() => {
    let ignore = false;
    api
      .get<CustomFormDetail>(`/custom-forms/${formId}`)
      .then(({ data }) => {
        if (ignore) return;
        setForm(data);
        setName(formId, data.title);
      })
      .catch((error) => {
        if (ignore) return;
        toast.error(getErrorMessage(error, "Formani yuklashda xatolik"));
        router.replace("/leads/forms");
      });
    return () => {
      ignore = true;
    };
  }, [formId, router, setName]);

  // Lid kartasidagi «Ko'chirish», «O'quvchiga aylantirish» va tiklash dialogi
  // ustun/bo'lim ro'yxatini doska store'idan oladi.
  useEffect(() => {
    if (board.length === 0) void fetchBoard();
  }, [board.length, fetchBoard]);

  // Lid kartasi yoki u ochgan dialog yopilganda lid o'zgargan bo'lishi mumkin
  // (tahrirlash, ko'chirish, o'quvchiga aylantirish, o'chirish), shuning uchun
  // javoblar qayta so'raladi. Doska `revision`iga bog'lanmaymiz: `fetchBoard`
  // ham uni oshiradi va sahifa ochilishida ortiqcha so'rov bo'lardi.
  const leadFlowOpen = useLeadsUi((s) =>
    Boolean(s.detailLeadId || s.editLead || s.moveLead || s.convertLead || s.deleteTarget),
  );
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !leadFlowOpen) void refetch();
    wasOpen.current = leadFlowOpen;
  }, [leadFlowOpen, refetch]);

  const restoreColumns = useMemo(
    () =>
      board.map((c) => ({
        id: c.id,
        name: c.name,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
      })),
    [board],
  );

  function handleRestore(row: SubmissionRow) {
    if (!row.lead) return;
    setRestoreTarget({
      id: row.lead.id,
      firstName: row.lead.firstName,
      lastName: row.lead.lastName,
    });
  }

  if (!form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-8 w-full max-w-xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const stages = submissions.result?.counts.stages;
  const totalResponses = stages
    ? Object.values(stages).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <ResponsesHeader
        form={form}
        canExport={totalResponses > 0}
        exporting={submissions.exporting}
        onExport={() => void submissions.exportCsv(form.title)}
      />
      <FormResponsesBody
        slug={form.slug}
        submissions={submissions}
        onOpenLead={(leadId) => openLeadDetail(leadId)}
        onRestore={handleRestore}
      />

      <LeadDetailDrawer />
      <EditLeadDrawer />
      <MoveLeadDialog />
      <ConvertLeadDialog />
      <DeleteConfirmDialog />
      <RestoreLeadDialog
        target={restoreTarget}
        columns={restoreColumns}
        onClose={() => setRestoreTarget(null)}
        onRestored={() => {
          setRestoreTarget(null);
          void refetch();
        }}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, FilePlus2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-permissions";
import api from "@/lib/api";
import { openAuthedFile } from "@/lib/download-file";
import { getErrorMessage } from "@/lib/get-error-message";
import { ContractCancelDialog } from "./contract-cancel-dialog";
import { ContractCard } from "./contract-card";
import { ContractFormDialog, type ContractDialogMode } from "./contract-form-dialog";
import { LINK_STATE_LABEL, upsertContract } from "./contract-rules";
import type { ContractView, ContractsResponse } from "./contract-types";

const contractsKey = (studentId: number) => ["contract-documents", studentId] as const;

// Identity, not a capability: only the CEO cancels a signed contract (matches `ContractLifecycleService.cancel`).
const SIGNED_CONTRACT_CANCEL_ROLE_IDS = [1];

interface Props {
  studentId: number;
  /** The profile card reloads: creating a contract may have written the birth date. */
  onStudentChanged?: () => void;
}

export function StudentContractsTab({ studentId, onStudentChanged }: Props) {
  const user = useAuth((s) => s.user);
  const isCeo =
    user?.roles.some((r) => SIGNED_CONTRACT_CANCEL_ROLE_IDS.includes(r.id)) ?? false;
  const canManage = useCan("students.manage");
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: contractsKey(studentId),
    queryFn: () =>
      api
        .get<ContractsResponse>("/contract-documents", { params: { studentId } })
        .then((r) => r.data),
  });
  const [dialog, setDialog] = useState<ContractDialogMode | null>(null);
  const [signTarget, setSignTarget] = useState<ContractView | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ContractView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const apply = (view: ContractView) =>
    qc.setQueryData<ContractsResponse>(contractsKey(studentId), (prev) =>
      prev ? upsertContract(prev, view) : prev,
    );

  const openPdf = async (c: ContractView) => {
    setBusyId(c.id);
    try {
      await openAuthedFile(`/contract-documents/${c.id}/pdf`, `Shartnoma-${c.number}.pdf`);
    } catch (err) {
      toast.error(getErrorMessage(err, "PDF ochishda xatolik yuz berdi"));
    } finally {
      setBusyId(null);
    }
  };

  const sign = async () => {
    const c = signTarget;
    if (!c) return;
    setSignTarget(null);
    setBusyId(c.id);
    try {
      const { data } = await api.post<ContractView>(`/contract-documents/${c.id}/sign`);
      apply(data);
      toast.success(`Shartnoma ${data.number} qog'ozda imzolangan deb belgilandi`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Belgilashda xatolik yuz berdi"));
    } finally {
      setBusyId(null);
    }
  };

  if (!query.data) {
    if (query.isError) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-lg border py-10 text-center">
          <p className="text-sm text-muted-foreground">Shartnomalarni yuklab bo&apos;lmadi</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Qayta urinish
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  const { contracts, uncovered } = query.data;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Shartnomalar</h2>
        {canManage && (
          <Button size="sm" onClick={() => setDialog({ kind: "create" })}>
            <FilePlus2 className="mr-1.5 size-4" />
            Shartnoma tuzish
          </Button>
        )}
      </div>

      {uncovered.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-0.5">
            {uncovered.map((u) => (
              <p key={u.enrollmentId}>
                Shartnomasiz kurs: {u.courseName}, {u.groupName} ({LINK_STATE_LABEL[u.status]})
              </p>
            ))}
          </div>
        </div>
      )}

      {contracts.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">
            {canManage
              ? "Hali shartnoma tuzilmagan — «Shartnoma tuzish» tugmasini bosing"
              : "Hali shartnoma tuzilmagan"}
          </p>
        </div>
      ) : (
        contracts.map((c) => (
          <ContractCard
            key={c.id}
            contract={c}
            isCeo={isCeo}
            canManage={canManage}
            busy={busyId === c.id}
            onPdf={() => openPdf(c)}
            onEdit={() => setDialog({ kind: "edit", contract: c })}
            onSign={() => setSignTarget(c)}
            onCancel={() => setCancelTarget(c)}
          />
        ))
      )}

      <ContractFormDialog
        studentId={studentId}
        mode={dialog}
        onClose={() => setDialog(null)}
        onSaved={(view, studentChanged) => {
          apply(view);
          setDialog(null);
          if (studentChanged) onStudentChanged?.();
        }}
      />

      <AlertDialog
        open={signTarget !== null}
        onOpenChange={(open) => !open && setSignTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Shartnoma № {signTarget?.number} qog&apos;ozda imzolandimi?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Buyurtmachi imzolagan nusxa markazda saqlanadi. Belgilangandan keyin shartnoma
              o&apos;zgarmaydi; xato bo&apos;lsa, uni faqat CEO bekor qila oladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ortga</AlertDialogCancel>
            <AlertDialogAction onClick={sign}>Ha, imzolandi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ContractCancelDialog
        contract={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={(view) => {
          apply(view);
          setCancelTarget(null);
          void qc.invalidateQueries({ queryKey: contractsKey(studentId) });
        }}
      />
    </div>
  );
}

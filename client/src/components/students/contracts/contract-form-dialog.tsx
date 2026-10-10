"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { ContractCreateForm } from "./contract-create-form";
import { ContractEditForm } from "./contract-edit-form";
import type { ContractPrefill, ContractView } from "./contract-types";

export type ContractDialogMode = { kind: "create" } | { kind: "edit"; contract: ContractView };

interface Props {
  studentId: number;
  mode: ContractDialogMode | null;
  onClose: () => void;
  onSaved: (view: ContractView, studentChanged: boolean) => void;
}

export function ContractFormDialog({ studentId, mode, onClose, onSaved }: Props) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>
            {mode?.kind === "edit" ? `Shartnoma № ${mode.contract.number}` : "Shartnoma tuzish"}
          </DialogTitle>
          <DialogDescription>
            {mode?.kind === "edit"
              ? "Imzolanmaguncha Buyurtmachi va kurs qo'shimcha ma'lumotlarini o'zgartirish mumkin."
              : "Kurs, guruh, ustoz, jadval va narx o'quvchining ma'lumotlaridan o'zi to'ldiriladi."}
          </DialogDescription>
        </DialogHeader>
        {mode?.kind === "edit" && (
          <ContractEditForm
            contract={mode.contract}
            onCancel={onClose}
            onSaved={(view) => onSaved(view, false)}
          />
        )}
        {mode?.kind === "create" && (
          <CreateLoader studentId={studentId} onCancel={onClose} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mounted only while the dialog is open, with `gcTime: 0`: every opening reads
 * fresh data and the form mounts once with it.
 */
function CreateLoader({
  studentId,
  onCancel,
  onSaved,
}: {
  studentId: number;
  onCancel: () => void;
  onSaved: (view: ContractView, studentChanged: boolean) => void;
}) {
  const prefill = useQuery({
    queryKey: ["contract-prefill", studentId],
    queryFn: () =>
      api
        .get<ContractPrefill>("/contract-documents/prefill", { params: { studentId } })
        .then((r) => r.data),
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (prefill.data) {
    return (
      <ContractCreateForm
        studentId={studentId}
        prefill={prefill.data}
        onCancel={onCancel}
        onSaved={onSaved}
      />
    );
  }
  if (prefill.isError) {
    return (
      <div className="flex flex-1 flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi</p>
        <Button variant="outline" size="sm" onClick={() => prefill.refetch()}>
          Qayta urinish
        </Button>
      </div>
    );
  }
  return (
    <div className="flex-1 space-y-3 px-6 py-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

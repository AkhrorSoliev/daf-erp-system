"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";

type ExitType = "GROUP_REMOVAL" | "FREEZE" | "EXPEL" | "INACTIVE" | "ARCHIVE";

const EXIT_TYPES: { value: ExitType; label: string }[] = [
  { value: "GROUP_REMOVAL", label: "Guruhdan chiqarish" },
  { value: "FREEZE", label: "Muzlatish" },
  { value: "EXPEL", label: "Chetlatish" },
  { value: "INACTIVE", label: "Nofaol qilish" },
  { value: "ARCHIVE", label: "Arxivlash" },
];

interface StudentExitReason {
  id: string;
  name: string;
  appliesTo: ExitType[];
  createdAt: string;
}

interface DepartureReasonsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DepartureReasonsDialog({
  open,
  onOpenChange,
}: DepartureReasonsDialogProps) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newAppliesTo, setNewAppliesTo] = useState<ExitType[]>([
    "GROUP_REMOVAL",
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingAppliesTo, setEditingAppliesTo] = useState<ExitType[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<StudentExitReason[]>({
    queryKey: ["student-exit-reasons", "all"],
    queryFn: () =>
      api
        .get<StudentExitReason[]>("/student-exit-reasons")
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["student-exit-reasons"] });

  const createMutation = useMutation({
    mutationFn: ({ name, appliesTo }: { name: string; appliesTo: ExitType[] }) =>
      api.post<StudentExitReason>("/student-exit-reasons", { name, appliesTo }),
    onSuccess: () => {
      setNewName("");
      setNewAppliesTo(["GROUP_REMOVAL"]);
      toast.success("Sabab qo'shildi");
      invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      name,
      appliesTo,
    }: {
      id: string;
      name: string;
      appliesTo: ExitType[];
    }) =>
      api.patch<StudentExitReason>(`/student-exit-reasons/${id}`, {
        name,
        appliesTo,
      }),
    onSuccess: () => {
      setEditingId(null);
      setEditingName("");
      setEditingAppliesTo([]);
      toast.success("Sabab yangilandi");
      invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/student-exit-reasons/${id}`),
    onSuccess: () => {
      setConfirmDeleteId(null);
      toast.success("Sabab o'chirildi");
      invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "O'chirishda xatolik yuz berdi"));
    },
  });

  const handleAdd = () => {
    const name = newName.trim();
    if (!name || newAppliesTo.length === 0) return;
    createMutation.mutate({ name, appliesTo: newAppliesTo });
  };

  const startEdit = (reason: StudentExitReason) => {
    setEditingId(reason.id);
    setEditingName(reason.name);
    setEditingAppliesTo(reason.appliesTo);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingAppliesTo([]);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name || editingAppliesTo.length === 0) return;
    updateMutation.mutate({
      id: editingId,
      name,
      appliesTo: editingAppliesTo,
    });
  };

  const toggleNewAppliesTo = (t: ExitType) =>
    setNewAppliesTo((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );

  const toggleEditingAppliesTo = (t: ExitType) =>
    setEditingAppliesTo((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );

  const confirmName = data?.find((r) => r.id === confirmDeleteId)?.name;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ketish va status sabablari</DialogTitle>
            <DialogDescription>
              O&apos;quvchi guruhdan chiqarilganda, muzlatilganda yoki
              chetlatilganda ko&apos;rsatiladigan sabablarni boshqaring
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-md border p-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Yangi sabab nomi"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              disabled={createMutation.isPending}
            />
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Qaysi holatlarga taalluqli:
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {EXIT_TYPES.map((t) => (
                  <label
                    key={t.value}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={newAppliesTo.includes(t.value)}
                      onCheckedChange={() => toggleNewAppliesTo(t.value)}
                      disabled={createMutation.isPending}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
            <Button
              onClick={handleAdd}
              disabled={
                createMutation.isPending ||
                !newName.trim() ||
                newAppliesTo.length === 0
              }
              className="w-full"
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Qo'shish"
              )}
            </Button>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto overscroll-contain">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))
            ) : !data || data.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Sabablar hali qo&apos;shilmagan
              </div>
            ) : (
              data.map((reason) => {
                const isEditing = editingId === reason.id;
                const isBusy =
                  (updateMutation.isPending && updateMutation.variables?.id === reason.id) ||
                  (deleteMutation.isPending && deleteMutation.variables === reason.id);
                return (
                  <div
                    key={reason.id}
                    className="rounded-md border p-3 space-y-2"
                  >
                    {isEditing ? (
                      <>
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveEdit();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEdit();
                            }
                          }}
                          disabled={updateMutation.isPending}
                          className="h-8"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          {EXIT_TYPES.map((t) => (
                            <label
                              key={t.value}
                              className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                              <Checkbox
                                checked={editingAppliesTo.includes(t.value)}
                                onCheckedChange={() =>
                                  toggleEditingAppliesTo(t.value)
                                }
                                disabled={updateMutation.isPending}
                              />
                              {t.label}
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEdit}
                            disabled={updateMutation.isPending}
                          >
                            <X className="size-4 mr-1" />
                            Bekor qilish
                          </Button>
                          <Button
                            size="sm"
                            onClick={saveEdit}
                            disabled={
                              updateMutation.isPending ||
                              !editingName.trim() ||
                              editingAppliesTo.length === 0
                            }
                          >
                            {updateMutation.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="size-4 mr-1" />
                                Saqlash
                              </>
                            )}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{reason.name}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground leading-tight">
                              {reason.appliesTo
                                .map(
                                  (t) =>
                                    EXIT_TYPES.find((e) => e.value === t)
                                      ?.label ?? t,
                                )
                                .join(" · ")}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEdit(reason)}
                              disabled={isBusy || editingId !== null}
                              aria-label="Tahrirlash"
                              className="h-8 w-8"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setConfirmDeleteId(reason.id)}
                              disabled={isBusy || editingId !== null}
                              aria-label="O'chirish"
                              className="h-8 w-8 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(o) => {
          if (!o && !deleteMutation.isPending) setConfirmDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sababni o&apos;chirish</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmName
                ? `"${confirmName}" sababini o'chirishni xohlaysizmi?`
                : "Sababni o'chirishni xohlaysizmi?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Bekor qilish
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmDeleteId) deleteMutation.mutate(confirmDeleteId);
              }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "O'chirish"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

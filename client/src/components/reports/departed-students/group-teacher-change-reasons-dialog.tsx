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

interface Reason {
  id: string;
  name: string;
  createdAt: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QUERY_KEY = ["group-teacher-change-reasons"] as const;
const API_PATH = "/group-teacher-change-reasons";

export function GroupTeacherChangeReasonsDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Reason[]>({
    queryKey: QUERY_KEY,
    queryFn: () => api.get<Reason[]>(API_PATH).then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post<Reason>(API_PATH, { name }),
    onSuccess: () => {
      setNewName("");
      toast.success("Sabab qo'shildi");
      invalidate();
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<Reason>(`${API_PATH}/${id}`, { name }),
    onSuccess: () => {
      setEditingId(null);
      setEditingName("");
      toast.success("Sabab yangilandi");
      invalidate();
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${API_PATH}/${id}`),
    onSuccess: () => {
      setConfirmDeleteId(null);
      toast.success("Sabab o'chirildi");
      invalidate();
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, "O'chirishda xatolik yuz berdi")),
  });

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate(name);
  };

  const startEdit = (reason: Reason) => {
    setEditingId(reason.id);
    setEditingName(reason.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    updateMutation.mutate({ id: editingId, name });
  };

  const confirmName = data?.find((r) => r.id === confirmDeleteId)?.name;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ustoz almashtirish sabablari</DialogTitle>
            <DialogDescription>
              Guruh ustozlari almashtirilganda ishlatiladigan sabablarni
              boshqaring
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Yangi sabab"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              disabled={createMutation.isPending}
            />
            <Button
              onClick={handleAdd}
              disabled={createMutation.isPending || !newName.trim()}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Qo'shish"
              )}
            </Button>
          </div>

          <div className="space-y-1 max-h-[360px] overflow-y-auto overscroll-contain">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))
            ) : !data || data.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Sabablar hali qo&apos;shilmagan
              </div>
            ) : (
              data.map((reason) => {
                const isEditing = editingId === reason.id;
                const isBusy =
                  (updateMutation.isPending &&
                    updateMutation.variables?.id === reason.id) ||
                  (deleteMutation.isPending &&
                    deleteMutation.variables === reason.id);
                return (
                  <div
                    key={reason.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-1.5"
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={saveEdit}
                          disabled={
                            updateMutation.isPending || !editingName.trim()
                          }
                          aria-label="Saqlash"
                          className="h-8 w-8 shrink-0"
                        >
                          {updateMutation.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Check className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={cancelEdit}
                          disabled={updateMutation.isPending}
                          aria-label="Bekor qilish"
                          className="h-8 w-8 shrink-0"
                        >
                          <X className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{reason.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEdit(reason)}
                          disabled={isBusy || editingId !== null}
                          aria-label="Tahrirlash"
                          className="h-8 w-8 shrink-0"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmDeleteId(reason.id)}
                          disabled={isBusy || editingId !== null}
                          aria-label="O'chirish"
                          className="h-8 w-8 shrink-0 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="size-4" />
                        </Button>
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

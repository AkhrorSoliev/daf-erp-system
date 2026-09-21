"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
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

/**
 * Every "sabab" list in the system has the same shape server-side: a
 * company-scoped `{ id, name }` row with soft delete, exposed as GET/POST/
 * PATCH/DELETE on its own collection. StudentExitReason adds one field —
 * `appliesTo`, the statuses it may be picked for — so that is the only thing
 * this component parametrises beyond the endpoint.
 *
 * Reason rows carry no branchId. They are company-wide by design: a reason
 * added here shows up in every branch.
 */

export interface ReasonTagOption {
  value: string;
  label: string;
}

export interface ReasonRow {
  id: string;
  name: string;
  appliesTo?: string[];
  createdAt: string;
}

interface ReasonListManagerProps {
  /** API collection, e.g. "/student-exit-reasons". */
  endpoint: string;
  /** React Query key root — must match the key the consuming pickers use. */
  queryKey: string;
  /** Placeholder for the "add" input. */
  addPlaceholder?: string;
  /** Shown when the list is empty. */
  emptyText?: string;
  /**
   * When set, each reason also carries an `appliesTo` multi-select. Omit for
   * the lists that are a plain name (transfer, teacher change).
   */
  tags?: {
    label: string;
    options: ReasonTagOption[];
    defaultValue: string[];
  };
}

export function ReasonListManager({
  endpoint,
  queryKey,
  addPlaceholder = "Yangi sabab nomi",
  emptyText = "Sabablar hali qo'shilmagan",
  tags,
}: ReasonListManagerProps) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newTags, setNewTags] = useState<string[]>(tags?.defaultValue ?? []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ReasonRow[]>({
    queryKey: [queryKey, "all"],
    queryFn: () => api.get<ReasonRow[]>(endpoint).then((r) => r.data),
    staleTime: 0,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: [queryKey] });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; appliesTo?: string[] }) =>
      api.post<ReasonRow>(endpoint, body),
    onSuccess: () => {
      setNewName("");
      setNewTags(tags?.defaultValue ?? []);
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
      ...body
    }: {
      id: string;
      name: string;
      appliesTo?: string[];
    }) => api.patch<ReasonRow>(`${endpoint}/${id}`, body),
    onSuccess: () => {
      cancelEdit();
      toast.success("Sabab yangilandi");
      invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${endpoint}/${id}`),
    onSuccess: () => {
      setConfirmDeleteId(null);
      toast.success("Sabab o'chirildi");
      invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "O'chirishda xatolik yuz berdi"));
    },
  });

  // A tagged list needs at least one tag ticked; an untagged one never blocks.
  const tagsValid = (selected: string[]) => !tags || selected.length > 0;

  const handleAdd = () => {
    const name = newName.trim();
    if (!name || !tagsValid(newTags)) return;
    createMutation.mutate({ name, ...(tags ? { appliesTo: newTags } : {}) });
  };

  const startEdit = (reason: ReasonRow) => {
    setEditingId(reason.id);
    setEditingName(reason.name);
    setEditingTags(reason.appliesTo ?? []);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingTags([]);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name || !tagsValid(editingTags)) return;
    updateMutation.mutate({
      id: editingId,
      name,
      ...(tags ? { appliesTo: editingTags } : {}),
    });
  };

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
  ) =>
    setter((prev) =>
      prev.includes(value)
        ? prev.filter((x) => x !== value)
        : [...prev, value],
    );

  const tagLabels = (values: string[]) =>
    values
      .map((v) => tags?.options.find((o) => o.value === v)?.label ?? v)
      .join(" · ");

  const confirmName = data?.find((r) => r.id === confirmDeleteId)?.name;

  return (
    <>
      <div className="space-y-3 rounded-md border p-3">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={addPlaceholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          disabled={createMutation.isPending}
        />
        {tags && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{tags.label}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {tags.options.map((t) => (
                <label
                  key={t.value}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={newTags.includes(t.value)}
                    onCheckedChange={() => toggle(setNewTags, t.value)}
                    disabled={createMutation.isPending}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
        )}
        <Button
          onClick={handleAdd}
          disabled={
            createMutation.isPending || !newName.trim() || !tagsValid(newTags)
          }
          className="w-full sm:w-auto"
        >
          {createMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Qo'shish"
          )}
        </Button>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))
        ) : !data || data.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {emptyText}
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
              <div key={reason.id} className="space-y-2 rounded-md border p-3">
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
                    {tags && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {tags.options.map((t) => (
                          <label
                            key={t.value}
                            className="flex cursor-pointer items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={editingTags.includes(t.value)}
                              onCheckedChange={() =>
                                toggle(setEditingTags, t.value)
                              }
                              disabled={updateMutation.isPending}
                            />
                            {t.label}
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelEdit}
                        disabled={updateMutation.isPending}
                      >
                        <X className="mr-1 size-4" />
                        Bekor qilish
                      </Button>
                      <Button
                        size="sm"
                        onClick={saveEdit}
                        disabled={
                          updateMutation.isPending ||
                          !editingName.trim() ||
                          !tagsValid(editingTags)
                        }
                      >
                        {updateMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="mr-1 size-4" />
                            Saqlash
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{reason.name}</p>
                      {tags && reason.appliesTo && (
                        <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                          {tagLabels(reason.appliesTo)}
                        </p>
                      )}
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
                )}
              </div>
            );
          })
        )}
      </div>

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
                ? `"${confirmName}" sababini o'chirishni xohlaysizmi? Ilgari shu sabab bilan yozilgan yozuvlar hisobotlarda saqlanib qoladi.`
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

/** Shared by the settings page and the report's ⚙ dialog. */
export const EXIT_TYPE_OPTIONS: ReasonTagOption[] = [
  { value: "GROUP_REMOVAL", label: "Guruhdan chiqarish" },
  { value: "FREEZE", label: "Muzlatish" },
  { value: "EXPEL", label: "Chetlatish" },
  { value: "INACTIVE", label: "Nofaol qilish" },
  { value: "ARCHIVE", label: "Arxivlash" },
];

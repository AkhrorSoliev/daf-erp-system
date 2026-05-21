"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2, Megaphone, Pencil, Plus, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
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
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

interface LeadSource {
  id: string;
  name: string;
}

interface ManageSourcesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ManageSourcesDialog({ open, onClose }: ManageSourcesDialogProps) {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<LeadSource | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setEditingId(null);
    setNewName("");
    api
      .get<LeadSource[]>("/lead-sources")
      .then(({ data }) => setSources(data))
      .catch((error) =>
        toast.error(getErrorMessage(error, "Manbalarni yuklashda xatolik")),
      )
      .finally(() => setLoading(false));
  }, [open]);

  const busy = adding || savingEdit || deleting;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      toast.error("Manba nomini kiriting");
      return;
    }
    setAdding(true);
    try {
      const { data } = await api.post<LeadSource>("/lead-sources", { name });
      setSources((prev) => [...prev, data]);
      setNewName("");
      toast.success("Manba qo'shildi");
    } catch (error) {
      toast.error(getErrorMessage(error, "Manba qo'shishda xatolik"));
    } finally {
      setAdding(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const name = editValue.trim();
    if (!name) {
      toast.error("Manba nomini kiriting");
      return;
    }
    setSavingEdit(true);
    try {
      const { data } = await api.patch<LeadSource>(
        `/lead-sources/${editingId}`,
        { name },
      );
      setSources((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      setEditingId(null);
      toast.success("Manba yangilandi");
    } catch (error) {
      toast.error(getErrorMessage(error, "Manbani yangilashda xatolik"));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/lead-sources/${deleteTarget.id}`);
      setSources((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      toast.success("Manba o'chirildi");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Manbani o'chirishda xatolik"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lid manbalari</DialogTitle>
            <DialogDescription>
              Lidlar qayerdan kelishini belgilaydigan manbalar ro&apos;yxati
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Yangi manba nomi (masalan: Instagram)"
              maxLength={100}
            />
            <Button type="submit" disabled={adding} className="shrink-0">
              {adding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Qo&apos;shish
            </Button>
          </form>

          <div className="max-h-72 overflow-y-auto rounded-md border">
            {loading ? (
              <div className="space-y-2 p-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : sources.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
                <Megaphone className="size-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Hali manba yo&apos;q — birinchi manbani qo&apos;shing
                </p>
              </div>
            ) : (
              <ul>
                {sources.map((source) => (
                  <li
                    key={source.id}
                    className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
                  >
                    {editingId === source.id ? (
                      <>
                        <Input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          maxLength={100}
                          className="h-8"
                        />
                        <Button
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={handleSaveEdit}
                          disabled={savingEdit}
                        >
                          {savingEdit ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Check className="size-4" />
                          )}
                          <span className="sr-only">Saqlash</span>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0"
                          onClick={() => setEditingId(null)}
                          disabled={savingEdit}
                        >
                          <X className="size-4" />
                          <span className="sr-only">Bekor qilish</span>
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 truncate text-sm">
                          {source.name}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0"
                          onClick={() => {
                            setEditingId(source.id);
                            setEditValue(source.name);
                          }}
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">Tahrirlash</span>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(source)}
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">O&apos;chirish</span>
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Manbani o&apos;chirish</AlertDialogTitle>
            <AlertDialogDescription>
              &laquo;{deleteTarget?.name}&raquo; manbasi o&apos;chiriladi. U endi
              yangi lid qo&apos;shishda tanlanmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              Bekor qilish
            </AlertDialogCancel>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              O&apos;chirish
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

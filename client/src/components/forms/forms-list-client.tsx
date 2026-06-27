"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileEdit,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  useCustomForms,
  type CustomFormSummary,
} from "@/hooks/use-custom-forms";
import { CopyFormLinkButton } from "./copy-form-link-dialog";

export function FormsListClient() {
  const { forms, loading, setForms } = useCustomForms(true);
  const [deleteTarget, setDeleteTarget] = useState<CustomFormSummary | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/custom-forms/${deleteTarget.id}`);
      setForms((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      toast.success("Forma o'chirildi");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "O'chirishda xatolik"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Maxsus formalar yaratib, ularning havolasini social mediaga ulashing.
          Foydalanuvchi to&apos;ldirgan ma&apos;lumotlar avtomatik tanlangan
          bo&apos;limga lid sifatida tushadi.
        </p>
        <Button asChild>
          <Link href="/leads/forms/new">
            <Plus className="size-4" />
            Yangi forma
          </Link>
        </Button>
      </div>

      <div className="rounded-md border bg-background">
        {loading ? (
          <div className="space-y-2 p-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <FileEdit className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Hali forma yo&apos;q
            </p>
            <Button asChild variant="outline" className="mt-2">
              <Link href="/leads/forms/new">
                <Plus className="size-4" />
                Birinchi formani yaratish
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {forms.map((form) => (
              <li
                key={form.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/leads/forms/${form.id}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {form.title}
                    </Link>
                    {!form.isActive && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        Faol emas
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {form.section.column.name} → {form.section.name}
                    {" • "}
                    {form.submissionCount} ta javob
                  </div>
                </div>
                <CopyFormLinkButton slug={form.slug} label="Havola" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="size-8">
                      <MoreHorizontal className="size-4" />
                      <span className="sr-only">Amallar</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/leads/forms/${form.id}`}>
                        <Pencil className="mr-2 size-4" />
                        Tahrirlash
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDeleteTarget(form)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 size-4" />
                      O&apos;chirish
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Formani o&apos;chirish</AlertDialogTitle>
            <AlertDialogDescription>
              &laquo;{deleteTarget?.title}&raquo; formasi arxivga
              ko&apos;chiriladi. Public havola ishlamay qoladi va yangi
              submission qabul qilinmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              Bekor qilish
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              O&apos;chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

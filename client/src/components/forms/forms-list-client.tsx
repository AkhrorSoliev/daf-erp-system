"use client";

import { useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Eye,
  FileEdit,
  Info,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  useCustomForms,
  type CustomFormSummary,
} from "@/hooks/use-custom-forms";
import { CopyFormLinkButton } from "./copy-form-link-dialog";
import { TablePagination } from "./table-pagination";

// Havola dialogi va menyu portal orqali chiziladi, lekin ulardagi bosish React
// daraxti bo'ylab qatorga yetib boradi — shu sabab o'rovchi katak to'xtatadi.
const stop = (event: SyntheticEvent) => event.stopPropagation();

function lastSubmitted(form: CustomFormSummary): string {
  return form.lastSubmittedAt
    ? format(new Date(form.lastSubmittedAt), "dd.MM.yyyy")
    : "Hali yo'q";
}

export function FormsListClient() {
  const router = useRouter();
  const { forms, loading, setForms } = useCustomForms(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<CustomFormSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // O'chirishdan keyin oxirgi sahifa bo'shab qolsa, mavjud oxirgisiga tushadi.
  const totalPages = Math.max(1, Math.ceil(forms.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const pageForms = forms.slice(offset, offset + pageSize);
  const open = (id: string) => router.push(`/leads/forms/${id}`);

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
          Formani bosing: kim ro&apos;yxatdan o&apos;tgani va kimga hali
          qo&apos;ng&apos;iroq qilinmagani ko&apos;rinadi.
        </p>
        <Button asChild>
          <Link href="/leads/forms/new">
            <Plus className="size-4" />
            Yangi forma
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2 rounded-md border p-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : forms.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border px-4 py-16 text-center">
          <FileEdit className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Hali forma yo&apos;q</p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/leads/forms/new">
              <Plus className="size-4" />
              Birinchi formani yaratish
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-md border sm:block">
            <FormsTable
              forms={pageForms}
              offset={offset}
              onOpen={open}
              onDelete={setDeleteTarget}
            />
          </div>
          <ul className="divide-y rounded-md border sm:hidden">
            {pageForms.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                onOpen={open}
                onDelete={setDeleteTarget}
              />
            ))}
          </ul>
          <TablePagination
            page={safePage}
            pageSize={pageSize}
            total={forms.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Formani o&apos;chirish</AlertDialogTitle>
            <AlertDialogDescription>
              &laquo;{deleteTarget?.title}&raquo; formasi arxivga
              ko&apos;chiriladi. Public havola ishlamay qoladi va yangi javob
              qabul qilinmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Bekor qilish</AlertDialogCancel>
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

interface RowProps {
  onOpen: (id: string) => void;
  onDelete: (form: CustomFormSummary) => void;
}

function FormsTable({
  forms,
  offset,
  onOpen,
  onDelete,
}: RowProps & { forms: CustomFormSummary[]; offset: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 border-r">#</TableHead>
          <TableHead>Forma</TableHead>
          <TableHead className="text-right">Javoblar</TableHead>
          <TableHead className="text-right">
            <span className="inline-flex items-center gap-1">
              Qo&apos;ng&apos;iroq kutmoqda
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  Hali hech kim qo&apos;ng&apos;iroq qilmagan yangi lidlar soni
                </TooltipContent>
              </Tooltip>
            </span>
          </TableHead>
          <TableHead>Oxirgi javob</TableHead>
          <TableHead className="w-28">
            <span className="sr-only">Havola</span>
          </TableHead>
          <TableHead className="w-12 text-right">Amal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {forms.map((form, index) => (
          <TableRow
            key={form.id}
            className="cursor-pointer"
            onClick={() => onOpen(form.id)}
          >
            <TableCell className="border-r text-muted-foreground">
              {offset + index + 1}
            </TableCell>
            <TableCell className="max-w-80">
              <FormTitle form={form} />
            </TableCell>
            <TableCell className="text-right">
              <div className="tabular-nums">
                <div className="font-medium">{form.submissionCount}</div>
                {form.convertedCount > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {form.convertedCount} tasi o&apos;quvchi bo&apos;ldi
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right">
              <AwaitingCount form={form} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {lastSubmitted(form)}
            </TableCell>
            <TableCell onClick={stop}>
              <CopyFormLinkButton slug={form.slug} label="Havola" />
            </TableCell>
            <TableCell className="text-right" onClick={stop}>
              <FormActions form={form} onOpen={onOpen} onDelete={onDelete} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FormCard({ form, onOpen, onDelete }: RowProps & { form: CustomFormSummary }) {
  return (
    <li className="space-y-2 px-3 py-3" onClick={() => onOpen(form.id)}>
      <div className="flex items-start justify-between gap-2">
        <FormTitle form={form} />
        <div className="flex shrink-0 items-center gap-1" onClick={stop}>
          <CopyFormLinkButton slug={form.slug} label="Havola" />
          <FormActions form={form} onOpen={onOpen} onDelete={onDelete} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">{form.submissionCount} javob</span>
        {form.awaitingCallCount > 0 && (
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            {form.awaitingCallCount} ta qo&apos;ng&apos;iroq kutmoqda
          </span>
        )}
        <span>{lastSubmitted(form)}</span>
      </div>
    </li>
  );
}

function FormTitle({ form }: { form: CustomFormSummary }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Link
          href={`/leads/forms/${form.id}`}
          onClick={stop}
          className="truncate font-medium hover:underline"
        >
          {form.title}
        </Link>
        {!form.isActive && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            Faol emas
          </Badge>
        )}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {form.section.column.name} → {form.section.name}
      </p>
    </div>
  );
}

function AwaitingCount({ form }: { form: CustomFormSummary }) {
  if (form.awaitingCallCount === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Link
      href={`/leads/forms/${form.id}?stage=awaiting`}
      onClick={stop}
      className="inline-flex min-w-8 justify-center rounded-md bg-amber-100 px-2 py-0.5 text-sm font-semibold tabular-nums text-amber-800 transition-colors hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-950"
    >
      {form.awaitingCallCount}
    </Link>
  );
}

function FormActions({ form, onOpen, onDelete }: RowProps & { form: CustomFormSummary }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Amallar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onOpen(form.id)}>
          <Eye className="mr-2 size-4" />
          Javoblar
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/leads/forms/${form.id}/tahrirlash`}>
            <Pencil className="mr-2 size-4" />
            Tahrirlash
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onDelete(form)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 size-4" />
          O&apos;chirish
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

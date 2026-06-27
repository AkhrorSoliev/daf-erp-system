"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPhone } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeletedBy {
  id: number;
  firstName: string;
  lastName: string;
}

interface ArchivedLead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  deletedAt: string | null;
  deletedBy: DeletedBy | null;
  section: {
    id: string;
    name: string;
    column: { id: string; name: string } | null;
  } | null;
}

interface ArchivedSection {
  id: string;
  name: string;
  deletedAt: string | null;
  deletedBy: DeletedBy | null;
  column: { id: string; name: string } | null;
  leadCount: number;
}

interface BoardColumn {
  id: string;
  name: string;
  sections: { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deletedByName(by: DeletedBy | null): string {
  if (!by) return "—";
  return [by.firstName, by.lastName].filter(Boolean).join(" ").trim() || "—";
}

function fmt(iso: string | null): string {
  return iso ? format(new Date(iso), "dd.MM.yyyy, HH:mm") : "—";
}

/** "Kim tomonidan" cell — name + a tooltip with the archive timestamp. */
function DeletedByCell({
  by,
  at,
}: {
  by: DeletedBy | null;
  at: string | null;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-muted-foreground">{deletedByName(by)}</span>
      </TooltipTrigger>
      <TooltipContent>Arxivlangan: {fmt(at)}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface LeadsArchiveProps {
  /** When rendered inside /settings/archive, returns to the category grid. */
  onBack?: () => void;
}

export function LeadsArchive({ onBack }: LeadsArchiveProps) {
  const [leads, setLeads] = useState<ArchivedLead[]>([]);
  const [sections, setSections] = useState<ArchivedSection[]>([]);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [loading, setLoading] = useState(true);

  const [restoreLeadTarget, setRestoreLeadTarget] =
    useState<ArchivedLead | null>(null);
  const [restoreSectionTarget, setRestoreSectionTarget] =
    useState<ArchivedSection | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [archive, board] = await Promise.all([
        api.get<{ leads: ArchivedLead[]; sections: ArchivedSection[] }>(
          "/leads/archive",
        ),
        api.get<BoardColumn[]>("/leads/board"),
      ]);
      setLeads(archive.data.leads);
      setSections(archive.data.sections);
      setColumns(board.data);
    } catch (error) {
      toast.error(getErrorMessage(error, "Arxivni yuklashda xatolik"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {onBack ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Arxivga qaytish</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/leads">
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Lidlarga qaytish</TooltipContent>
          </Tooltip>
        )}
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Lidlar arxivi</h2>
          <p className="text-xs text-muted-foreground">
            O&apos;chirilgan lidlar va bo&apos;limlar — tiklash mumkin
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ArchivedLeadsCard
          leads={leads}
          loading={loading}
          onRestore={setRestoreLeadTarget}
        />
        <ArchivedSectionsCard
          sections={sections}
          loading={loading}
          onRestore={setRestoreSectionTarget}
        />
      </div>

      <RestoreLeadDialog
        target={restoreLeadTarget}
        columns={columns}
        onClose={() => setRestoreLeadTarget(null)}
        onRestored={() => {
          setRestoreLeadTarget(null);
          fetchData();
        }}
      />
      <RestoreSectionDialog
        target={restoreSectionTarget}
        columns={columns}
        onClose={() => setRestoreSectionTarget(null)}
        onRestored={() => {
          setRestoreSectionTarget(null);
          fetchData();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column 1 — archived leads
// ---------------------------------------------------------------------------

function ArchivedLeadsCard({
  leads,
  loading,
  onRestore,
}: {
  leads: ArchivedLead[];
  loading: boolean;
  onRestore: (lead: ArchivedLead) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">
        Arxivlangan lidlar{" "}
        <span className="text-muted-foreground">({leads.length})</span>
      </h3>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 border-r">#</TableHead>
              <TableHead>Ism</TableHead>
              <TableHead>Bo&apos;lim</TableHead>
              <TableHead>Kim tomonidan</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <div className="h-5 animate-pulse rounded bg-muted/50" />
                  </TableCell>
                </TableRow>
              ))
            ) : leads.length === 0 ? (
              <EmptyRow span={5} text="Arxivda lid yo'q" />
            ) : (
              leads.map((lead, index) => (
                <TableRow key={lead.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">
                      {lead.firstName} {lead.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(lead.phone)}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lead.section ? (
                      <>
                        {lead.section.column?.name ?? "—"}
                        {" · "}
                        {lead.section.name}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <DeletedByCell by={lead.deletedBy} at={lead.deletedAt} />
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onRestore(lead)}
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Tiklash</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column 2 — archived sections
// ---------------------------------------------------------------------------

function ArchivedSectionsCard({
  sections,
  loading,
  onRestore,
}: {
  sections: ArchivedSection[];
  loading: boolean;
  onRestore: (section: ArchivedSection) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">
        Arxivlangan bo&apos;limlar{" "}
        <span className="text-muted-foreground">({sections.length})</span>
      </h3>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 border-r">#</TableHead>
              <TableHead>Bo&apos;lim</TableHead>
              <TableHead>Lidlar</TableHead>
              <TableHead>Kim tomonidan</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <div className="h-5 animate-pulse rounded bg-muted/50" />
                  </TableCell>
                </TableRow>
              ))
            ) : sections.length === 0 ? (
              <EmptyRow span={5} text="Arxivda bo'lim yo'q" />
            ) : (
              sections.map((section, index) => (
                <TableRow key={section.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{section.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {section.column?.name ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {section.leadCount}
                  </TableCell>
                  <TableCell>
                    <DeletedByCell
                      by={section.deletedBy}
                      at={section.deletedAt}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onRestore(section)}
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Tiklash</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EmptyRow({ span, text }: { span: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={span} className="h-24 text-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <Archive className="size-7 text-muted-foreground/50" />
          {text}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Restore a lead — pick column + section
// ---------------------------------------------------------------------------

function RestoreLeadDialog({
  target,
  columns,
  onClose,
  onRestored,
}: {
  target: ArchivedLead | null;
  columns: BoardColumn[];
  onClose: () => void;
  onRestored: () => void;
}) {
  const [columnId, setColumnId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = !!target;

  useEffect(() => {
    if (open) {
      setColumnId("");
      setSectionId("");
      setSubmitting(false);
    }
  }, [open]);

  const sections = useMemo(
    () => columns.find((c) => c.id === columnId)?.sections ?? [],
    [columns, columnId],
  );

  async function handleConfirm() {
    if (!target) return;
    if (!columnId || !sectionId) {
      toast.error("Ustun va bo'limni tanlang");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/leads/${target.id}/restore`, { columnId, sectionId });
      toast.success("Lid tiklandi");
      onRestored();
    } catch (error) {
      toast.error(getErrorMessage(error, "Tiklashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lidni tiklash</DialogTitle>
          <DialogDescription>
            &laquo;{target?.firstName} {target?.lastName}&raquo; lidi
            qaytariladigan ustun va bo&apos;limni tanlang
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ustun</Label>
            <Select
              value={columnId}
              onValueChange={(v) => {
                setColumnId(v);
                setSectionId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ustunni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem key={col.id} value={col.id}>
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Bo&apos;lim</Label>
            <Select
              value={sectionId}
              onValueChange={setSectionId}
              disabled={!columnId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    columnId
                      ? sections.length
                        ? "Bo'limni tanlang"
                        : "Bu ustunda bo'lim yo'q"
                      : "Avval ustunni tanlang"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sections.map((sec) => (
                  <SelectItem key={sec.id} value={sec.id}>
                    {sec.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Tiklash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Restore a section — pick a column + with / without its leads
// ---------------------------------------------------------------------------

function RestoreSectionDialog({
  target,
  columns,
  onClose,
  onRestored,
}: {
  target: ArchivedSection | null;
  columns: BoardColumn[];
  onClose: () => void;
  onRestored: () => void;
}) {
  const [columnId, setColumnId] = useState("");
  const [withLeads, setWithLeads] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const open = !!target;
  const hasLeads = (target?.leadCount ?? 0) > 0;

  useEffect(() => {
    if (open) {
      // Pre-select the section's original column only if it still exists (it may
      // itself have been deleted); otherwise start empty so the user must pick a
      // live column rather than submit a stale, invalid id.
      const origin = target?.column?.id;
      setColumnId(origin && columns.some((c) => c.id === origin) ? origin : "");
      setWithLeads((target?.leadCount ?? 0) > 0);
      setSubmitting(false);
    }
  }, [open, target, columns]);

  async function handleConfirm() {
    if (!target) return;
    if (!columnId) {
      toast.error("Ustunni tanlang");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/lead-sections/${target.id}/restore`, {
        targetColumnId: columnId,
        withLeads: hasLeads ? withLeads : false,
      });
      toast.success("Bo'lim tiklandi");
      onRestored();
    } catch (error) {
      toast.error(getErrorMessage(error, "Tiklashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bo&apos;limni tiklash</DialogTitle>
          <DialogDescription>
            &laquo;{target?.name}&raquo; bo&apos;limi qaytariladigan ustunni
            tanlang
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ustun</Label>
            <Select value={columnId} onValueChange={setColumnId}>
              <SelectTrigger>
                <SelectValue placeholder="Ustunni tanlang" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Ustunlar</SelectLabel>
                  {columns.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {hasLeads && (
            <div className="space-y-1.5">
              <Label>Ichidagi lidlar ({target?.leadCount} ta)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={withLeads ? "default" : "outline"}
                  onClick={() => setWithLeads(true)}
                  className={cn("h-auto py-2 text-xs", !withLeads && "font-normal")}
                >
                  Lidlari bilan
                </Button>
                <Button
                  type="button"
                  variant={!withLeads ? "default" : "outline"}
                  onClick={() => setWithLeads(false)}
                  className={cn("h-auto py-2 text-xs", withLeads && "font-normal")}
                >
                  Lidlarsiz (bo&apos;sh)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {withLeads
                  ? "Bo'lim ichidagi arxivlangan lidlar bilan birga tiklanadi."
                  : "Faqat bo'lim tiklanadi; lidlar arxivda qoladi."}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Tiklash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

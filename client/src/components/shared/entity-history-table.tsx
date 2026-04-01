"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  RotateCcw,
  MessageSquare,
  UserPlus,
  UserMinus,
  ArrowRightLeft,
  ChevronsRight,
  Bot,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import api from "@/lib/api";

// --- Types ---
interface HistoryRecord {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE" | "RESTORE";
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  changedBy: { id: number; firstName: string; lastName: string; photo: string | null } | null;
  createdAt: string;
}

interface EntityHistoryTableProps {
  entityType: string;
  entityId: string | number;
}

// --- Field labels (texnik nom → o'zbekcha) ---
const FIELD_LABELS: Record<string, string | null> = {
  firstName: "Ism",
  lastName: "Familiya",
  phone: "Telefon",
  status: "Status",
  name: "Ism",
  login: "Login",
  gender: "Jinsi",
  balance: "Balans",
  mainBranch: "Asosiy filial",
  guruh: "Guruh",
  sabab: "Sabab",
  reason: "Sabab",
  content: "Izoh",
  isActive: "Faolmi",
  photo: "Rasm",
  comment: "Izoh",
  dateOfBirth: "Tug'ilgan sana",
  // Yashiriladigan texnik field lar
  action: null,
  isTask: null,
  commentId: null,
  companyId: null,
  nomi: "Nomi",
  kunlar: "Kunlar",
  vaqt: "Vaqt",
  boshlanish: "Boshlanish sanasi",
  oquvchi: "O'quvchi",
  ustoz: "Ustoz",
  ustozlar: "Ustozlar",
  previousGroupId: null,
  guruhId: null,
  oquvchiId: null,
};

function getFieldLabel(key: string): string | null {
  if (key in FIELD_LABELS) return FIELD_LABELS[key];
  return key;
}

// --- Kontekstli action aniqlash ---
function getActionInfo(record: HistoryRecord): {
  label: string;
  icon: typeof Plus;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  const nv = record.newValues as Record<string, unknown> | null;
  const ov = record.oldValues as Record<string, unknown> | null;
  const customAction = (nv?.action ?? ov?.action) as string | undefined;

  switch (record.action) {
    case "CREATE":
      if (customAction === "COMMENT_ADDED") return { label: "Izoh qo'shildi", icon: MessageSquare, variant: "secondary" };
      if (customAction === "TELEGRAM_ROYXATDAN_OTDI") return { label: "Telegram orqali ro'yxatdan o'tdi", icon: Bot, variant: "default" };
      if (customAction === "GURUHGA_QOSHILDI") return { label: "Guruhga qo'shildi", icon: UserPlus, variant: "default" };
      if (customAction === "OQUVCHI_QOSHILDI") return { label: "O'quvchi qo'shildi", icon: UserPlus, variant: "default" };
      if (customAction === "SMS_YUBORILDI") return { label: "SMS yuborildi", icon: MessageSquare, variant: "default" };
      if (customAction === "SMS_YUBORILMADI") return { label: "SMS yuborilmadi", icon: MessageSquare, variant: "destructive" };
      if (nv?.guruh) return { label: "Guruhga qo'shildi", icon: UserPlus, variant: "default" };
      return { label: "Yaratildi", icon: Plus, variant: "default" };

    case "UPDATE":
      if (customAction === "COMMENT_DELETED") return { label: "Izoh o'chirildi", icon: Trash2, variant: "destructive" };
      if (nv && ov && "guruh" in (nv as object)) return { label: "Guruh o'zgartirildi", icon: ArrowRightLeft, variant: "secondary" };
      return { label: "Yangilandi", icon: Pencil, variant: "secondary" };

    case "DELETE":
      if (customAction === "GURUHDAN_CHIQARILDI" || ov?.guruh) return { label: "Guruhdan chiqarildi", icon: UserMinus, variant: "destructive" };
      if (customAction === "OQUVCHI_CHIQARILDI") return { label: "O'quvchi chiqarildi", icon: UserMinus, variant: "destructive" };
      if (customAction === "USTOZ_OLIB_TASHLANDI") return { label: "Ustoz olib tashlandi", icon: UserMinus, variant: "destructive" };
      if (customAction === "COMMENT_DELETED") return { label: "Izoh o'chirildi", icon: Trash2, variant: "destructive" };
      return { label: "Arxivlandi", icon: Trash2, variant: "destructive" };

    case "STATUS_CHANGE":
      return { label: "Status o'zgardi", icon: RefreshCw, variant: "outline" };

    case "RESTORE":
      return { label: "Tiklandi", icon: RotateCcw, variant: "default" };

    default:
      return { label: record.action, icon: Pencil, variant: "outline" };
  }
}

// --- Value formatter ---
const VALUE_MAX_LENGTH = 80;

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Ha" : "Yo'q";
  return String(value);
}

function truncateValue(value: unknown): { text: string; truncated: boolean } {
  const full = formatValue(value);
  if (full.length <= VALUE_MAX_LENGTH) return { text: full, truncated: false };
  return { text: full.slice(0, VALUE_MAX_LENGTH) + "…", truncated: true };
}

// --- Skeleton ---
function HistorySkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell className="border-r"><Skeleton className="h-4 w-5" /></TableCell>
          <TableCell><div className="flex items-center gap-2"><Skeleton className="size-6 rounded-full" /><Skeleton className="h-3.5 w-20" /></div></TableCell>
          <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

// --- Render entries helper ---
function renderEntries(
  entries: [string, unknown][],
  mode: "create" | "delete" | "restore" | "diff",
  oldValues?: Record<string, unknown> | null,
) {
  const hasLong = entries.some(([, val]) => {
    if (mode === "diff" && oldValues) {
      return formatValue(val).length > VALUE_MAX_LENGTH || formatValue(oldValues[entries.find(([k]) => k)?.[0] ?? ""] ?? null).length > VALUE_MAX_LENGTH;
    }
    return formatValue(val).length > VALUE_MAX_LENGTH;
  });

  return { hasLong, entries };
}

// --- Changed fields display ---
function ChangedFields({ record }: { record: HistoryRecord }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { action, oldValues, newValues } = record;

  let entries: [string, unknown][] = [];
  let mode: "create" | "delete" | "restore" | "diff" = "create";
  let hasLongValue = false;

  if (action === "CREATE" && newValues) {
    entries = Object.entries(newValues).filter(([key]) => getFieldLabel(key) !== null);
    mode = "create";
  } else if (action === "DELETE" && oldValues) {
    entries = Object.entries(oldValues).filter(([key]) => getFieldLabel(key) !== null);
    mode = "delete";
  } else if ((action === "UPDATE" || action === "STATUS_CHANGE") && oldValues && newValues) {
    entries = Object.keys(newValues)
      .filter((key) => getFieldLabel(key) !== null)
      .map((key) => [key, newValues[key]]);
    mode = "diff";
  } else if (action === "RESTORE" && newValues) {
    entries = Object.entries(newValues).filter(([key]) => getFieldLabel(key) !== null);
    mode = "restore";
  }

  if (entries.length === 0) {
    if (action === "DELETE") return <span className="text-xs text-muted-foreground">Arxivlandi</span>;
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  // Check if any value is long
  hasLongValue = entries.some(([key, val]) => {
    if (mode === "diff" && oldValues) {
      return formatValue(val).length > VALUE_MAX_LENGTH || formatValue(oldValues[key]).length > VALUE_MAX_LENGTH;
    }
    return formatValue(val).length > VALUE_MAX_LENGTH;
  });

  const shownEntries = mode === "create" ? entries.slice(0, 3) : entries;

  const getGroupId = (values: Record<string, unknown> | null) =>
    values?.guruhId as string | undefined;

  const getStudentId = (values: Record<string, unknown> | null) =>
    values?.oquvchiId as number | undefined;

  const renderEntityLink = (text: string, href?: string) =>
    href ? (
      <a href={href} className="font-medium text-primary underline underline-offset-2 hover:text-primary/80">
        {text}
      </a>
    ) : (
      <span className="font-medium">{text}</span>
    );

  const renderRow = (key: string, val: unknown, full: boolean) => {
    const label = getFieldLabel(key);
    const v = full ? { text: formatValue(val), truncated: false } : truncateValue(val);

    if (mode === "diff" && oldValues) {
      const ov = full ? { text: formatValue(oldValues[key]), truncated: false } : truncateValue(oldValues[key]);

      if (key === "guruh") {
        const gid = getGroupId(newValues);
        return (
          <div key={key} className="text-xs">
            <span className="text-muted-foreground">{label}:</span>{" "}
            <span className="text-red-500 line-through">{ov.text}</span>
            {" → "}
            {renderEntityLink(v.text, gid ? `/groups/${gid}` : undefined)}
          </div>
        );
      }

      return (
        <div key={key} className="text-xs">
          <span className="text-muted-foreground">{label}:</span>{" "}
          <span className="text-red-500 line-through">{ov.text}</span>
          {" → "}
          <span className="font-medium text-green-600">{v.text}</span>
        </div>
      );
    }

    if (key === "guruh") {
      const gid = getGroupId(mode === "delete" ? oldValues : newValues);
      return (
        <div key={key} className="text-xs">
          <span className="text-muted-foreground">{label}:</span>{" "}
          {renderEntityLink(v.text, gid ? `/groups/${gid}` : undefined)}
        </div>
      );
    }

    if (key === "oquvchi") {
      const sid = getStudentId(mode === "delete" ? oldValues : newValues);
      return (
        <div key={key} className="text-xs">
          <span className="text-muted-foreground">{label}:</span>{" "}
          {renderEntityLink(v.text, sid ? `/students/profile/${sid}` : undefined)}
        </div>
      );
    }

    return (
      <div key={key} className="text-xs">
        <span className="text-muted-foreground">{label}:</span>{" "}
        <span className={`font-medium ${mode === "restore" ? "text-green-600" : ""}`}>{v.text}</span>
      </div>
    );
  };

  return (
    <>
      <div className="space-y-0.5">
        {shownEntries.map(([key, val]) => renderRow(key, val, false))}
        {mode === "create" && entries.length > 3 && (
          <span className="text-[10px] text-muted-foreground">+{entries.length - 3} ta maydon</span>
        )}
        {hasLongValue && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline mt-0.5"
          >
            To&apos;liq o&apos;qish
            <ChevronsRight className="size-3" />
          </button>
        )}
      </div>

      {hasLongValue && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>O&apos;zgarishlar tafsiloti</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-96 overflow-y-auto py-2">
              {entries.map(([key, val]) => renderRow(key, val, true))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// --- Main component ---
export function EntityHistoryTable({ entityType, entityId }: EntityHistoryTableProps) {
  const router = useRouter();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const fetched = useRef(false);

  const fetchHistory = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const { data } = await api.get(
        `/entity-history/${entityType}/${entityId}`,
        { params: { page: p, pageSize } },
      );
      setRecords(data.data);
      setTotal(data.total);
      setPage(data.page);
    } catch {
      setRecords([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      fetchHistory(1);
    }
  }, [fetchHistory]);

  const totalPages = Math.ceil(total / pageSize);

  if (loading && records.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="w-40">Kim</TableHead>
              <TableHead className="w-44">Amal</TableHead>
              <TableHead>O&apos;zgarishlar</TableHead>
              <TableHead className="w-36">Sana</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <HistorySkeleton />
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!loading && records.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border">
        <p className="text-sm text-muted-foreground">Tarix mavjud emas</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="w-40">Kim</TableHead>
              <TableHead className="w-44">Amal</TableHead>
              <TableHead>O&apos;zgarishlar</TableHead>
              <TableHead className="w-36">Sana</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record, index) => {
              const actionInfo = getActionInfo(record);
              const Icon = actionInfo.icon;

              return (
                <TableRow key={record.id}>
                  {/* # */}
                  <TableCell className="border-r text-muted-foreground">
                    {(page - 1) * pageSize + index + 1}
                  </TableCell>

                  {/* Kim — avatar + ism, clickable */}
                  <TableCell>
                    {record.changedBy ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center gap-2 hover:underline text-left"
                            onClick={() => router.push(`/settings/employees/${record.changedBy!.id}`)}
                          >
                            <Avatar className="size-6">
                              {record.changedBy.photo && <AvatarImage src={record.changedBy.photo} />}
                              <AvatarFallback className="text-[8px] font-medium">
                                {`${record.changedBy.firstName?.[0] ?? ''}${record.changedBy.lastName?.[0] ?? ''}`}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{record.changedBy.firstName} {record.changedBy.lastName}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Profilga o&apos;tish</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-sm text-muted-foreground">Tizim</span>
                    )}
                  </TableCell>

                  {/* Amal — kontekstli badge */}
                  <TableCell>
                    <Badge variant={actionInfo.variant} className="gap-1">
                      <Icon className="size-3" />
                      {actionInfo.label}
                    </Badge>
                  </TableCell>

                  {/* O'zgarishlar */}
                  <TableCell>
                    <ChangedFields record={record} />
                  </TableCell>

                  {/* Sana */}
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(record.createdAt), "dd.MM.yyyy, HH:mm")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Jami: {total} ta yozuv</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => fetchHistory(page - 1)}
            >
              Oldingi
            </Button>
            <span>{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => fetchHistory(page + 1)}
            >
              Keyingi
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

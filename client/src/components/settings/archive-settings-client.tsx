"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Users,
  Building2,
  DoorOpen,
  BookOpen,
  GraduationCap,
  UserPlus,
  UsersRound,
  CalendarOff,
  Link2,
  Archive,
  ArrowLeft,
  RotateCcw,
  Trash2,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SettingsPageHeader } from "./settings-page-header";
import { ArchiveDetailSheet } from "./archive-detail-sheet";
import { archiveReason, isDetailType } from "./archive-detail-rules";
import { LeadsArchive } from "@/components/leads/leads-archive";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import type { Params } from "@/i18n/translate";

type Translate = (source: string, params?: Params) => string;

interface ArchiveCounts {
  users: number;
  branches: number;
  rooms: number;
  courses: number;
  students: number;
  leads: number;
  groups: number;
  enrollments: number;
  holidays: number;
}

interface EntityCategory {
  key: keyof ArchiveCounts;
  label: string;
  icon: React.ElementType;
}

const categories: EntityCategory[] = [
  { key: "users", label: msg("Ustozlar / Xodimlar"), icon: Users },
  { key: "students", label: msg("O'quvchilar"), icon: GraduationCap },
  { key: "groups", label: msg("Guruhlar"), icon: UsersRound },
  { key: "courses", label: msg("Kurslar"), icon: BookOpen },
  { key: "leads", label: msg("Lidlar"), icon: UserPlus },
  { key: "branches", label: msg("Filiallar"), icon: Building2 },
  { key: "rooms", label: msg("Xonalar"), icon: DoorOpen },
  { key: "enrollments", label: msg("Yozilishlar"), icon: Link2 },
  { key: "holidays", label: msg("Dam olish kunlari"), icon: CalendarOff },
];

const archiveSchema = {
  type: { type: "string" as const, defaultValue: "" },
};

export function ArchiveSettingsClient() {
  const t = useT();
  // The counts load once; a language switch must not refetch (ref copy, not a dep).
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  const [counts, setCounts] = useState<ArchiveCounts | null>(null);
  const { filters: archiveFilters, setFilter: setArchiveFilter, resetFilters } = useUrlFilters(archiveSchema);
  const [loading, setLoading] = useState(true);

  const selected = useMemo(() => {
    const type = archiveFilters.type;
    return type && categories.some((c) => c.key === type) ? (type as keyof ArchiveCounts) : null;
  }, [archiveFilters.type]);

  const fetchCounts = useCallback(async () => {
    try {
      const { data } = await api.get("/archive/counts");
      setCounts(data);
    } catch {
      toast.error(tRef.current(msg("Arxiv ma'lumotlarini yuklashda xatolik")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Leads have a dedicated two-column archive (leads | sections) with their own
  // restore flow, open to CEO/BD/Admin — not the generic single table.
  if (selected === "leads") {
    return (
      <LeadsArchive
        onBack={() => {
          resetFilters();
          fetchCounts();
        }}
      />
    );
  }

  if (selected) {
    const category = categories.find((c) => c.key === selected)!;
    return (
      <ArchiveList
        entityType={selected}
        label={category.label}
        onBack={() => {
          resetFilters();
          fetchCounts();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title={t("Arxiv")}
        description={t("O'chirilgan ma'lumotlar shu yerda saqlanadi. Faqat CEO ko'ra oladi.")}
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border bg-muted/30"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => {
            const count = counts?.[cat.key] ?? 0;
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                onClick={() => setArchiveFilter("type", cat.key)}
                className="flex items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{t(cat.label)}</p>
                  <p className="text-xs text-muted-foreground">
                    {count > 0
                      ? t("{n} ta arxivlangan", { n: count })
                      : t("Arxivda yo'q")}
                  </p>
                </div>
                {count > 0 && (
                  <span className="flex size-6 items-center justify-center rounded-full bg-destructive/10 text-xs font-medium text-destructive">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------- Archive List (ichki sahifa) -------

interface ArchiveListProps {
  entityType: keyof ArchiveCounts;
  label: string;
  onBack: () => void;
}

const archiveListSchema = {
  type: { type: "string" as const, defaultValue: "" },
  search: { type: "string" as const, defaultValue: "" },
  page: { type: "number" as const, defaultValue: 1 },
  id: { type: "string" as const, defaultValue: "" },
  atab: { type: "string" as const, defaultValue: "" },
};

function ArchiveList({ entityType, label, onBack }: ArchiveListProps) {
  const t = useT();
  // A language switch must not refetch the list (ref copy, not a dep).
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const { filters, setFilter, setFilters: setUrlFilters } = useUrlFilters(archiveListSchema);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | number | null>(null);
  const perPage = 10;
  const canOpen = isDetailType(entityType);
  const showReason = canOpen;
  const colCount = showReason ? 6 : 5;
  const openId = canOpen ? filters.id : "";
  const sheetTab = filters.atab === "tarix" ? "tarix" : "malumot";
  const [restoreTarget, setRestoreTarget] = useState<any | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const openRestore = (item: any) => {
    setRestoreTarget(item);
    setRestoreOpen(true);
  };
  const closeSheet = () => setUrlFilters({ id: "", atab: "" });

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setUrlFilters({ search: value, page: 1 });
  }, 300);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: filters.page, pageSize: perPage };
      if (filters.search.trim()) params.search = filters.search.trim();
      const { data } = await api.get(`/archive/${entityType}`, { params });
      setItems(data.data);
      setTotal(data.total);
    } catch {
      toast.error(tRef.current(msg("Ma'lumotlarni yuklashda xatolik")));
    } finally {
      setLoading(false);
    }
  }, [entityType, filters.page, filters.search]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleRestore = async (id: string | number) => {
    setActionId(id);
    try {
      await api.post(`/archive/${entityType}/${id}/restore`);
      toast.success(t("Muvaffaqiyatli tiklandi"));
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      if (filters.id === String(id)) closeSheet();
      setRestoreOpen(false);
    } catch (err) {
      // A refused restore says why — e.g. a student card whose number is on
      // another live card (ADR-0033).
      toast.error(getErrorMessage(err, t("Tiklashda xatolik yuz berdi")));
    } finally {
      setActionId(null);
    }
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("Arxivga qaytish")}</TooltipContent>
        </Tooltip>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t(label)}</h2>
          <p className="text-xs text-muted-foreground">
            {t("{n} ta arxivlangan", { n: total })}
          </p>
        </div>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("Qidirish...")}
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            debouncedSetSearch(e.target.value);
          }}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>{t("Nomi")}</TableHead>
              {showReason && <TableHead>{t("Sabab")}</TableHead>}
              <TableHead>{t("Arxivlangan sana")}</TableHead>
              <TableHead>{t("Kim tomonidan")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={colCount}>
                    <div className="h-5 animate-pulse rounded bg-muted/50" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="h-24 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Archive className="size-8 text-muted-foreground/50" />
                    {t("Arxivda hech narsa topilmadi")}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, index) => (
                <TableRow
                  key={item.id}
                  className={
                    canOpen
                      ? "cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      : undefined
                  }
                  aria-label={
                    canOpen
                      ? t("{name} — ko'rish", { name: getDisplayName(entityType, item, t) })
                      : undefined
                  }
                  tabIndex={canOpen ? 0 : undefined}
                  onClick={canOpen ? () => setUrlFilters({ id: String(item.id) }) : undefined}
                  onKeyDown={
                    canOpen
                      ? (e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setUrlFilters({ id: String(item.id) });
                          }
                        }
                      : undefined
                  }
                >
                  <TableCell className="border-r text-muted-foreground">
                    {(filters.page - 1) * perPage + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {getDisplayName(entityType, item, t)}
                  </TableCell>
                  {showReason && (
                    <TableCell>
                      {archiveReason(item) ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">
                    {item.deletedAt
                      ? format(new Date(item.deletedAt), "dd.MM.yyyy, HH:mm")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {deletedByName(item)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={actionId === item.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openRestore(item);
                            }}
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("Qayta tiklash")}</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground/40"
                            disabled
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("Hozircha ishlamaydi")}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {t("{page} / {pages} sahifa ({n} ta)", {
              page: filters.page,
              pages: totalPages,
              n: total,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setFilter("page", filters.page - 1)}
            >
              {t("Oldingi")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => setFilter("page", filters.page + 1)}
            >
              {t("Keyingi")}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={restoreOpen}
        onOpenChange={(open) => {
          if (!open) setRestoreOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Qayta tiklash")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("«{name}» arxivdan tiklanadi va faol holatga qaytadi. Davom etasizmi?", {
                name: restoreTarget ? getDisplayName(entityType, restoreTarget, t) : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Bekor qilish")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreTarget && handleRestore(restoreTarget.id)}
            >
              {t("Tiklash")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {openId && isDetailType(entityType) && (
        <ArchiveDetailSheet
          key={openId}
          entityType={entityType}
          id={openId}
          tab={sheetTab}
          onTabChange={(t) => setUrlFilters({ atab: t === "tarix" ? "tarix" : "" })}
          onClose={closeSheet}
          onRestore={openRestore}
          restoring={actionId !== null && String(actionId) === openId}
        />
      )}
    </div>
  );
}

/**
 * The archive API selects the deleter as `{ id, firstName, lastName }` (no
 * `.name`), so the column used to always render "—". Compose the name here so
 * "Kim tomonidan" works for every entity type; fall back to `.name` just in
 * case a shape ever provides it.
 */
function deletedByName(item: any): string {
  const by = item.deletedBy;
  if (!by) return "—";
  const composed = [by.firstName, by.lastName].filter(Boolean).join(" ").trim();
  return composed || by.name || "—";
}

function getDisplayName(entityType: string, item: any, t: Translate): string {
  switch (entityType) {
    // `User` carries firstName/lastName, never a `name` column, so reading
    // `item.name` here rendered "Noma'lum" for every archived staff member.
    case "users":
      return (
        `${item.firstName || ""} ${item.lastName || ""}`.trim() || t("Noma'lum")
      );
    case "students":
      return (
        `${item.firstName || ""} ${item.lastName || ""}`.trim() || t("Noma'lum")
      );
    case "leads":
      return (
        `${item.firstName || ""} ${item.lastName || ""}`.trim() || t("Noma'lum")
      );
    case "groups":
      return item.name || t("Noma'lum");
    case "courses":
      return item.name || t("Noma'lum");
    case "branches":
      return item.name || t("Noma'lum");
    case "rooms":
      return item.name || t("Noma'lum");
    case "enrollments":
      return `${item.student?.firstName || ""} ${item.student?.lastName || ""} → ${item.group?.name || ""}`.trim();
    case "holidays":
      return item.name || t("Noma'lum");
    default:
      return item.name || item.id;
  }
}

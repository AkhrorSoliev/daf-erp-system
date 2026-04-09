"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SettingsPageHeader } from "./settings-page-header";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";

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
  { key: "users", label: "Ustozlar / Xodimlar", icon: Users },
  { key: "students", label: "O'quvchilar", icon: GraduationCap },
  { key: "groups", label: "Guruhlar", icon: UsersRound },
  { key: "courses", label: "Kurslar", icon: BookOpen },
  { key: "leads", label: "Lidlar", icon: UserPlus },
  { key: "branches", label: "Filiallar", icon: Building2 },
  { key: "rooms", label: "Xonalar", icon: DoorOpen },
  { key: "enrollments", label: "Yozilishlar", icon: Link2 },
  { key: "holidays", label: "Dam olish kunlari", icon: CalendarOff },
];

const archiveSchema = {
  type: { type: "string" as const, defaultValue: "" },
};

export function ArchiveSettingsClient() {
  const [counts, setCounts] = useState<ArchiveCounts | null>(null);
  const { filters: archiveFilters, setFilter: setArchiveFilter, resetFilters } = useUrlFilters(archiveSchema);
  const [loading, setLoading] = useState(true);

  const selected = useMemo(() => {
    const t = archiveFilters.type;
    return t && categories.some((c) => c.key === t) ? (t as keyof ArchiveCounts) : null;
  }, [archiveFilters.type]);

  const fetchCounts = useCallback(async () => {
    try {
      const { data } = await api.get("/archive/counts");
      setCounts(data);
    } catch {
      toast.error("Arxiv ma'lumotlarini yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

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
        title="Arxiv"
        description="O'chirilgan ma'lumotlar shu yerda saqlanadi. Faqat CEO ko'ra oladi."
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
                  <p className="text-sm font-medium">{cat.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {count > 0 ? `${count} ta arxivlangan` : "Bo'sh"}
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
};

function ArchiveList({ entityType, label, onBack }: ArchiveListProps) {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const { filters, setFilter, setFilters: setUrlFilters } = useUrlFilters(archiveListSchema);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | number | null>(null);
  const perPage = 10;

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setUrlFilters({ search: value, page: 1 });
  }, 300);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: filters.page, per_page: perPage };
      if (filters.search.trim()) params.search = filters.search.trim();
      const { data } = await api.get(`/archive/${entityType}`, { params });
      setItems(data.data);
      setTotal(data.total);
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
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
      toast.success("Muvaffaqiyatli tiklandi");
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch {
      toast.error("Tiklashda xatolik yuz berdi");
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
          <TooltipContent>Arxivga qaytish</TooltipContent>
        </Tooltip>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{label}</h2>
          <p className="text-xs text-muted-foreground">
            {total} ta arxivlangan
          </p>
        </div>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Qidirish..."
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
              <TableHead>Nomi</TableHead>
              <TableHead>Arxivlangan sana</TableHead>
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
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Archive className="size-8 text-muted-foreground/50" />
                    Arxivda hech narsa topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {(filters.page - 1) * perPage + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {getDisplayName(entityType, item)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.deletedAt
                      ? format(new Date(item.deletedAt), "dd.MM.yyyy, HH:mm")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.deletedBy?.name || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <AlertDialog>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                disabled={actionId === item.id}
                              >
                                <RotateCcw className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                          </TooltipTrigger>
                          <TooltipContent>Qayta tiklash</TooltipContent>
                        </Tooltip>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Qayta tiklash</AlertDialogTitle>
                            <AlertDialogDescription>
                              &quot;{getDisplayName(entityType, item)}&quot;
                              arxivdan tiklanadi va faol holatga qaytadi. Davom
                              etasizmi?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRestore(item.id)}
                            >
                              Tiklash
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

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
                          Hozircha ishlamaydi
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
            {filters.page} / {totalPages} sahifa ({total} ta)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setFilter("page", filters.page - 1)}
            >
              Oldingi
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => setFilter("page", filters.page + 1)}
            >
              Keyingi
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function getDisplayName(entityType: string, item: any): string {
  switch (entityType) {
    case "users":
      return item.name || "Noma'lum";
    case "students":
      return (
        `${item.firstName || ""} ${item.lastName || ""}`.trim() || "Noma'lum"
      );
    case "leads":
      return (
        `${item.firstName || ""} ${item.lastName || ""}`.trim() || "Noma'lum"
      );
    case "groups":
      return item.name || "Noma'lum";
    case "courses":
      return item.name || "Noma'lum";
    case "branches":
      return item.name || "Noma'lum";
    case "rooms":
      return item.name || "Noma'lum";
    case "enrollments":
      return `${item.student?.firstName || ""} ${item.student?.lastName || ""} → ${item.group?.name || ""}`.trim();
    case "holidays":
      return item.name || "Noma'lum";
    default:
      return item.name || item.id;
  }
}

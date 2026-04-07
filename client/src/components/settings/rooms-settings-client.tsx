"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  DoorOpen,
  Building2,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Badge } from "@/components/ui/badge";
import { SettingsPageHeader } from "./settings-page-header";
import { RoomRowActions } from "./room-row-actions";
import { EditRoomDrawer } from "./edit-room-drawer";
import { useEditRoom } from "@/hooks/use-edit-room";
import type { Room } from "@/hooks/use-edit-room";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import api from "@/lib/api";

const roomsSchema = {
  branch: { type: "string" as const, defaultValue: "" },
  search: { type: "string" as const, defaultValue: "" },
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 10 },
};

interface BranchWithCount {
  id: number;
  name: string;
  address: string | null;
  isActive: boolean;
  roomCount: number;
}

// ——— Branch list view ———
function BranchListView({
  onSelect,
  search,
  onSearchChange,
}: {
  onSelect: (branch: BranchWithCount) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const [branches, setBranches] = useState<BranchWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const companyId = localStorage.getItem("companyId");
        const params = companyId ? { company_id: companyId } : {};
        const { data } = await api.get("/rooms/count-by-branch", { params });
        setBranches(data);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const filtered = branches.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      (b.address ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Xonalar"
        description="Filial tanlang va xonalarni boshqaring"
      />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Filial nomi bo'yicha qidirish..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full sm:max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Filial nomi</TableHead>
              <TableHead>Manzil</TableHead>
              <TableHead>Xonalar soni</TableHead>
              <TableHead>Holati</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="h-8 w-8 text-muted-foreground/50" />
                    Filiallar topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((branch, index) => (
                <TableRow
                  key={branch.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelect(branch)}
                >
                  <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell>{branch.address ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{branch.roomCount} ta xona</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={branch.isActive ? "default" : "secondary"}
                    >
                      {branch.isActive ? "Faol" : "Nofaol"}
                    </Badge>
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

type RoomsFilters = ReturnType<typeof useUrlFilters<typeof roomsSchema>>;

// ——— Rooms table for a selected branch ———
function BranchRoomsView({
  branch,
  onBack,
  filters,
  setFilter,
  setUrlFilters,
  searchInput,
  onSearchChange,
}: {
  branch: BranchWithCount;
  onBack: () => void;
  filters: RoomsFilters["filters"];
  setFilter: RoomsFilters["setFilter"];
  setUrlFilters: RoomsFilters["setFilters"];
  searchInput: string;
  onSearchChange: (value: string) => void;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const openAddDrawer = useEditRoom((s) => s.openAddDrawer);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/rooms", {
        params: { branch_id: branch.id, page: filters.page, pageSize: filters.pageSize },
      });
      setRooms(
        data.data.map((r: any) => ({
          id: r.id,
          name: r.name,
          capacity: r.capacity,
          branchId: r.branchId,
          branchName: r.branch?.name ?? "",
          groupCount: r.groupCount ?? 0,
        })),
      );
      setTotal(data.total);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [branch.id, filters.page, filters.pageSize]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const filtered = rooms.filter((r) =>
    r.name.toLowerCase().includes(filters.search.toLowerCase()),
  );

  const totalPages = Math.ceil(total / filters.pageSize);

  const handleSaved = (saved: Room) => {
    setRooms((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    // refetch to get correct total
    fetchRooms();
  };

  const handleDeleted = (id: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== id));
    setTotal((prev) => prev - 1);
  };

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title={`${branch.name} — Xonalar`}
        description={`${branch.name} filialidagi xonalarni boshqarish`}
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={() => openAddDrawer(branch.id)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Yangi xona
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yangi xona qo&apos;shish</TooltipContent>
          </Tooltip>
        }
      />

      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Filiallar
            </Button>
          </TooltipTrigger>
          <TooltipContent>Filiallar ro&apos;yxatiga qaytish</TooltipContent>
        </Tooltip>
        <Input
          placeholder="Xona nomi bo'yicha qidirish..."
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full sm:max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Xona nomi</TableHead>
              <TableHead>Sig&apos;imi</TableHead>
              <TableHead>Guruhlar</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <DoorOpen className="h-8 w-8 text-muted-foreground/50" />
                    Xonalar topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((room, index) => (
                <TableRow
                  key={room.id}
                  className="relative cursor-pointer hover:bg-muted/50"
                >
                  <TableCell className="border-r text-muted-foreground">
                    {(filters.page - 1) * filters.pageSize + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/settings/rooms/${room.id}`} className="absolute inset-0" />
                    {room.name}
                  </TableCell>
                  <TableCell>
                    {room.capacity ? `${room.capacity} o'rin` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{room.groupCount ?? 0} ta guruh</Badge>
                  </TableCell>
                  <TableCell>
                    <RoomRowActions room={room} onDeleted={handleDeleted} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Jami: {total} ta xona
          </p>
          <div className="flex items-center gap-3">
            <Select
              value={String(filters.pageSize)}
              onValueChange={(v) => {
                setUrlFilters({ pageSize: Number(v), page: 1 });
              }}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 40, 50].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page <= 1}
                onClick={() => setFilter("page", filters.page - 1)}
              >
                Oldingi
              </Button>
              <span className="px-2 text-sm text-muted-foreground">
                {filters.page} / {totalPages}
              </span>
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
        </div>
      )}

      <EditRoomDrawer onSaved={handleSaved} />
    </div>
  );
}

// ——— Main component ———
export function RoomsSettingsClient() {
  const { filters, setFilter, setFilters: setUrlFilters, resetFilters } = useUrlFilters(roomsSchema);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [selectedBranch, setSelectedBranch] =
    useState<BranchWithCount | null>(null);

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setUrlFilters({ search: value, page: 1 });
  }, 300);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    debouncedSetSearch(value);
  };

  if (selectedBranch || filters.branch) {
    return (
      <BranchRoomsView
        branch={selectedBranch!}
        onBack={() => { setSelectedBranch(null); resetFilters(); setSearchInput(""); }}
        filters={filters}
        setFilter={setFilter}
        setUrlFilters={setUrlFilters}
        searchInput={searchInput}
        onSearchChange={handleSearchChange}
      />
    );
  }

  return (
    <BranchListView
      onSelect={(branch) => {
        setSelectedBranch(branch);
        setSearchInput("");
        setUrlFilters({ branch: String(branch.id), search: "", page: 1, pageSize: 10 });
      }}
      search={searchInput}
      onSearchChange={handleSearchChange}
    />
  );
}

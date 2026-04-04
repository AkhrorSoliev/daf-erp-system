"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Plus, QrCode, Search } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TeachersTable } from "./teachers-table";
import { EditTeacherDrawer } from "./edit-teacher-drawer";
import { useEditTeacher, type TeacherData } from "@/hooks/use-edit-teacher";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

export function TeachersClient() {
  const [teachers, setTeachers] = useState<TeacherData[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const { openAddDrawer } = useEditTeacher();
  const user = useAuth((s) => s.user);
  const canManageTeachers = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);

  const handleCopyLink = async () => {
    if (!selectedBranch) return;
    const link = `https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT}?start=teacher_${selectedBranch.id}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Havola nusxalandi");
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchTeachers = useCallback(async () => {
    if (!branchLoaded) return;
    setLoading(true);
    try {
      const companyId = localStorage.getItem("companyId");
      const params: Record<string, any> = {
        user_type: "Teacher",
        page,
        per_page: pageSize,
      };
      if (companyId) params.company_id = companyId;
      if (selectedBranch) params.branch_id = selectedBranch.id;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get("/users", { params });
      setTeachers(data.data);
      setTotal(data.total);
    } catch {
      // xatolik
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, selectedBranch, branchLoaded]);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Ism bo'yicha qidirish..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {canManageTeachers && (
            selectedBranch ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="sm:size-auto sm:px-4" onClick={handleCopyLink}>
                      {copied ? (
                        <Check className="size-4 text-green-500 sm:mr-2" />
                      ) : (
                        <Copy className="size-4 sm:mr-2" />
                      )}
                      <span className="hidden sm:inline">{copied ? "Nusxalandi" : "Havola olish"}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Telegram orqali ro&apos;yxatdan o&apos;tish havolasini nusxalash
                  </TooltipContent>
                </Tooltip>
                <Dialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="icon">
                          <QrCode className="size-4" />
                        </Button>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>QR kod orqali havola</TooltipContent>
                  </Tooltip>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>QR kod — O&apos;qituvchi ro&apos;yxatdan o&apos;tish</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-4 py-4">
                      <div className="rounded-lg border bg-white p-4">
                        <QRCodeSVG
                          value={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT}?start=teacher_${selectedBranch.id}`}
                          size={280}
                          level="M"
                        />
                      </div>
                      <p className="text-muted-foreground text-center text-sm">
                        Ushbu QR kodni skanerlang va Telegram bot orqali ro&apos;yxatdan o&apos;ting
                      </p>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" size="icon" className="sm:size-auto sm:px-4" disabled>
                      <Copy className="size-4 sm:mr-2" />
                      <span className="hidden sm:inline">Havola olish</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Avval filial tanlang
                </TooltipContent>
              </Tooltip>
            )
          )}
          {canManageTeachers && (
            selectedBranch ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={openAddDrawer} size="icon" className="sm:size-auto sm:px-4">
                    <Plus className="size-4 sm:mr-2" />
                    <span className="hidden sm:inline">Yangi o&apos;qituvchi</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="sm:hidden">Yangi o&apos;qituvchi</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button disabled size="icon" className="sm:size-auto sm:px-4">
                      <Plus className="size-4 sm:mr-2" />
                      <span className="hidden sm:inline">Yangi o&apos;qituvchi</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Avval filial qo&apos;shing
                </TooltipContent>
              </Tooltip>
            )
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border">
          Yuklanmoqda...
        </div>
      ) : (
        <TeachersTable
          teachers={teachers}
          onDeleted={(id) => {
            setTeachers((prev) => prev.filter((t) => t.id !== id));
            setTotal((prev) => Math.max(0, prev - 1));
          }}
        />
      )}

      {totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Sahifada:</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-sm">
              Jami: {total} ta o&apos;qituvchi
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="mr-1 size-4" />
              Oldingi
            </Button>
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Keyingi
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}

      {canManageTeachers && (
        <EditTeacherDrawer
          onSaved={(updated) => {
            setTeachers((prev) => {
              const exists = prev.some((t) => t.id === updated.id);
              if (exists) {
                // Update — optimistic replace
                return prev.map((t) => (t.id === updated.id ? updated : t));
              }
              // Add — refetch to respect pagination/filters
              fetchTeachers();
              return prev;
            });
          }}
        />
      )}
    </div>
  );
}

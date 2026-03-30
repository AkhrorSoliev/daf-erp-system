"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Check, CircleDot, Clock, Copy, DoorOpen, GraduationCap, Link2, Loader2, Pencil, Phone, Users, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditBranch } from "@/hooks/use-edit-branch";
import { EditBranchDrawer } from "./edit-branch-drawer";
import type { Branch } from "@/hooks/use-edit-branch";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import api from "@/lib/api";

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) {
    return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }
  return `+998 ${phone}`;
}

interface BranchDetailClientProps {
  branchId: string;
}

export function BranchDetailClient({ branchId }: BranchDetailClientProps) {
  const router = useRouter();
  const openDrawer = useEditBranch((s) => s.openDrawer);
  const setName = useBreadcrumbName((s) => s.setName);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [stats, setStats] = useState({ groups: 0, students: 0, teachers: 0, rooms: 0, courses: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  const registrationLink = `https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT}?start=teacher_${branchId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(registrationLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    async function fetchBranch() {
      try {
        const { data } = await api.get(`/branches/${branchId}`);
        const branchData = {
          id: String(data.id),
          name: data.name,
          address: data.address ?? "",
          phone: data.phone ?? "",
          status: data.isActive ? ("active" as const) : ("inactive" as const),
          startOfWorkingDay: data.startOfWorkingDay ?? "",
          endOfWorkingDay: data.endOfWorkingDay ?? "",
        };
        setBranch(branchData);
        if (data._count) {
          setStats(data._count);
        }
        setName(branchId, branchData.name);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchBranch();
  }, [branchId]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !branch) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Filial topilmadi
        </h1>
        <p className="text-muted-foreground">
          ID: {branchId} bo&apos;yicha filial mavjud emas
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push("/settings/branches")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Orqaga</TooltipContent>
        </Tooltip>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {branch.name}
            </h2>
            <Badge
              variant={branch.status === "active" ? "default" : "secondary"}
            >
              {branch.status === "active" ? "Faol" : "Nofaol"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">ID: {branch.id}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openDrawer(branch)}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              Tahrirlash
            </Button>
          </TooltipTrigger>
          <TooltipContent>Filialni tahrirlash</TooltipContent>
        </Tooltip>
      </div>

      {/* Statistika */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <UsersRound className="size-4" />
            <p className="text-sm">Guruhlar</p>
          </div>
          <p className="mt-1 text-2xl font-bold">{stats.groups}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <GraduationCap className="size-4" />
            <p className="text-sm">O&apos;quvchilar</p>
          </div>
          <p className="mt-1 text-2xl font-bold">{stats.students}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <p className="text-sm">Ustozlar</p>
          </div>
          <p className="mt-1 text-2xl font-bold">{stats.teachers}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DoorOpen className="size-4" />
            <p className="text-sm">Xonalar</p>
          </div>
          <p className="mt-1 text-2xl font-bold">{stats.rooms}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="size-4" />
            <p className="text-sm">Kurslar</p>
          </div>
          <p className="mt-1 text-2xl font-bold">{stats.courses}</p>
        </div>
      </div>

      {/* Ma'lumotlar */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-lg font-semibold mb-4">
          Filial ma&apos;lumotlari
        </h3>

        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="size-3.5" />
              <p className="text-sm">Telefon</p>
            </div>
            {branch.phone ? (
              <a
                href={`tel:+998${branch.phone}`}
                className="mt-0.5 block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                {formatPhone(branch.phone)}
              </a>
            ) : (
              <p className="mt-0.5 text-sm italic text-muted-foreground">
                Ko&apos;rsatilmagan
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-3.5" />
              <p className="text-sm">Ish vaqti</p>
            </div>
            {branch.startOfWorkingDay && branch.endOfWorkingDay ? (
              <p className="mt-0.5 text-sm font-medium">
                {branch.startOfWorkingDay} — {branch.endOfWorkingDay}
              </p>
            ) : (
              <p className="mt-0.5 text-sm italic text-muted-foreground">
                Ko&apos;rsatilmagan
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CircleDot className="size-3.5" />
              <p className="text-sm">Holat</p>
            </div>
            <Badge
              variant={branch.status === "active" ? "default" : "secondary"}
              className="mt-1"
            >
              {branch.status === "active" ? "Faol" : "Nofaol"}
            </Badge>
          </div>
        </div>
      </div>

      {/* O'qituvchi ro'yxatdan o'tish havolasi */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-lg font-semibold mb-2">
          O&apos;qituvchi ro&apos;yxatdan o&apos;tish havolasi
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          Bu havolani o&apos;qituvchilarga yuboring. Ular Telegram orqali
          ro&apos;yxatdan o&apos;tadi va avtomatik ravishda ushbu filialga
          biriktiriladi.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-md border bg-muted/50 px-3 py-2">
            <div className="flex items-center gap-2">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <code className="text-sm break-all">{registrationLink}</code>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? (
                  <Check className="mr-1.5 h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="mr-1.5 h-4 w-4" />
                )}
                {copied ? "Nusxalandi" : "Nusxalash"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Havolani nusxalash</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <EditBranchDrawer onSaved={(updated) => setBranch(updated)} />
    </div>
  );
}

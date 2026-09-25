"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Check, CircleDot, Clock, Copy, DoorOpen, GraduationCap, Link2, Loader2, Pencil, Phone, Users, UsersRound } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
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
import { copyPendingText } from "@/lib/clipboard";
import { toBranch } from "@/lib/branch-record";
import {
  isTelegramBotConfigured,
  TELEGRAM_BOT_NOT_CONFIGURED,
} from "@/lib/telegram-link";
import { useTeacherRegistrationLink } from "@/hooks/use-teacher-registration-link";

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
  const [copying, setCopying] = useState(false);

  // Signed, server-minted link (roleIds [4]). The old unsigned
  // `teacher_<branchId>` payload let anyone register into any branch.
  const {
    link: registrationLink,
    loading: linkLoading,
    reload: reloadLink,
  } = useTeacherRegistrationLink(Number(branchId));

  // The link shown was minted when the page opened and dies three days later
  // (ADR-0029), so every copy mints a new one, which also replaces the one shown.
  // The button depends on the bot being configured, not on a link being
  // shown, so a failed mint leaves it enabled for a retry.
  const handleCopy = async () => {
    setCopying(true);
    try {
      const url = await copyPendingText(reloadLink());
      if (!url) {
        toast.error(TELEGRAM_BOT_NOT_CONFIGURED);
        return;
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Havolani nusxalab bo'lmadi");
    } finally {
      setCopying(false);
    }
  };

  useEffect(() => {
    async function fetchBranch() {
      try {
        const { data } = await api.get(`/branches/${branchId}`);
        const branchData = toBranch(data);
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
              className="h-8 w-8 hidden sm:inline-flex"
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
            <StatusBadge entityType="branches" status={branch.status} />
          </div>
          <p className="text-sm text-muted-foreground">ID: {branch.id}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              data-tour="branch-edit"
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
            <StatusBadge
              entityType="branches"
              status={branch.status}
              className="mt-1"
            />
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
              {registrationLink ? (
                <code className="text-sm break-all">{registrationLink}</code>
              ) : linkLoading ? (
                <Skeleton className="h-5 w-full" />
              ) : (
                <span className="text-muted-foreground text-sm">
                  {TELEGRAM_BOT_NOT_CONFIGURED}
                </span>
              )}
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  disabled={!isTelegramBotConfigured || copying}
                >
                  {copying ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : copied ? (
                    <Check className="mr-1.5 h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="mr-1.5 h-4 w-4" />
                  )}
                  {copied ? "Nusxalandi" : "Nusxalash"}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {isTelegramBotConfigured
                ? "Havolani nusxalash"
                : TELEGRAM_BOT_NOT_CONFIGURED}
            </TooltipContent>
          </Tooltip>
        </div>
        {registrationLink ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Havola 3 kun amal qiladi.
          </p>
        ) : null}
      </div>

      <EditBranchDrawer onSaved={(updated) => setBranch(updated)} />
    </div>
  );
}

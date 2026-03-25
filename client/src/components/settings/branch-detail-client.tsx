"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Loader2, MapPin, Pencil, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchBranch() {
      try {
        const { data } = await api.get(`/branches/${branchId}`);
        const branchData = {
          id: String(data.id),
          name: data.name,
          address: data.address ?? "",
          phone: data.phone ?? "",
          status: (data.isActive ? "active" : "inactive") as const,
        };
        setBranch(branchData);
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

      {/* Ma'lumotlar */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-lg font-semibold mb-4">
          Filial ma&apos;lumotlari
        </h3>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Filial nomi</p>
              <p className="text-sm font-medium">{branch.name}</p>
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-3">
            <MapPin className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Manzil</p>
              <p className="text-sm font-medium">
                {branch.address || (
                  <span className="italic text-muted-foreground">
                    Ko&apos;rsatilmagan
                  </span>
                )}
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-3">
            <Phone className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Telefon</p>
              {branch.phone ? (
                <a
                  href={`tel:+998${branch.phone}`}
                  className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  {formatPhone(branch.phone)}
                </a>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  Ko&apos;rsatilmagan
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <EditBranchDrawer onSaved={(updated) => setBranch(updated)} />
    </div>
  );
}

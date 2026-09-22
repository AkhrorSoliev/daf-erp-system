"use client";

import Link from "next/link";
import { ArrowLeft, Download, Loader2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CustomFormDetail } from "@/hooks/use-custom-forms";
import { CopyFormLinkButton } from "../copy-form-link-dialog";

interface Props {
  form: CustomFormDetail;
  canExport: boolean;
  exporting: boolean;
  onExport: () => void;
}

export function ResponsesHeader({ form, canExport, exporting, onExport }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link href="/leads/forms">
                <ArrowLeft className="size-4" />
                <span className="sr-only">Formalarga qaytish</span>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Formalarga qaytish</TooltipContent>
        </Tooltip>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {form.title}
            </h1>
            <Badge variant={form.isActive ? "secondary" : "outline"}>
              {form.isActive ? "Faol" : "Faol emas"}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {form.section.column.name} → {form.section.name}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CopyFormLinkButton slug={form.slug} label="Havola" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={!canExport || exporting}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              CSV
            </Button>
          </TooltipTrigger>
          <TooltipContent>Joriy filtrdagi javoblarni Excel uchun yuklab olish</TooltipContent>
        </Tooltip>
        <Button asChild size="sm">
          <Link href={`/leads/forms/${form.id}/tahrirlash`}>
            <Pencil className="size-4" />
            Tahrirlash
          </Link>
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import {
  AlertCircle,
  PhoneCall,
  SearchX,
  Share2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyFormLinkButton } from "../copy-form-link-dialog";
import { TablePagination } from "../table-pagination";
import { ResponsesTable } from "./responses-table";
import { ResponsesToolbar, type ToolbarFilters } from "./responses-toolbar";
import type { SubmissionRow } from "./types";
import type { FormSubmissionsState } from "./use-form-submissions";

interface Props {
  slug: string;
  submissions: FormSubmissionsState;
  onOpenLead: (leadId: string) => void;
  onRestore: (row: SubmissionRow) => void;
}

export function FormResponsesBody({ slug, submissions, onOpenLead, onRestore }: Props) {
  const {
    result,
    loading,
    error,
    filters,
    setFilters,
    resetFilters,
    toggleCalled,
    refetch,
  } = submissions;
  const changeFilters = useCallback(
    (updates: Partial<ToolbarFilters>) => setFilters({ ...updates, page: 1 }),
    [setFilters],
  );

  // Sahifa jami natijadan oshib qolishi mumkin — masalan boshqa oynada
  // qolgan barcha qatorlar «qo'ng'iroq qilindi» deb belgilanib jami kamaysa,
  // yoki eski ?page= havolasi ochilsa. Bunday holatda bo'sh holat ko'rsatish
  // o'rniga oxirgi mavjud sahifaga qaytariladi.
  useEffect(() => {
    if (!result || loading) return;
    if (result.data.length !== 0 || result.total === 0 || filters.page <= 1) {
      return;
    }
    setFilters({ page: Math.max(1, Math.ceil(result.total / filters.pageSize)) });
  }, [result, loading, filters.page, filters.pageSize, setFilters]);

  if (!result) {
    // Filtr o'zi 400 bilan yiqilishi mumkin (masalan eski/qo'lda o'zgartirilgan
    // ?stage= havolasi) — bunday holda toolbar ko'rsatilmagani uchun
    // foydalanuvchi filtrni tozalay olmay qoladi. Xatolik bo'lsa qayta urinish
    // tugmasi bilan ko'rsatiladi, aks holda jadval yuklanish holatida turadi.
    if (!loading && error) {
      return (
        <EmptyState
          icon={AlertCircle}
          title="Javoblarni yuklab bo'lmadi"
          description={error}
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              Qayta urinish
            </Button>
          }
        />
      );
    }
    return (
      <ResponsesTable
        rows={[]}
        columns={[]}
        loading
        offset={0}
        onToggleCalled={toggleCalled}
        onOpenLead={onOpenLead}
        onRestore={onRestore}
      />
    );
  }

  const formTotal = Object.values(result.counts.stages).reduce((a, b) => a + b, 0);
  if (formTotal === 0) return <NoResponsesYet slug={slug} />;

  const otherFilters = Boolean(
    filters.source.length || filters.search || filters.startDate || filters.endDate,
  );
  // Sahifa hozircha noto'g'ri — yuqoridagi effekt uni tuzatmoqda. Bo'sh
  // holat o'rniga jadval yuklanish ko'rinishida turadi.
  const pageOverflow =
    result.data.length === 0 && result.total > 0 && filters.page > 1;
  const empty = !loading && result.total === 0;

  return (
    <div className="flex flex-col gap-4">
      <ResponsesToolbar counts={result.counts} filters={filters} onChange={changeFilters} />
      {empty ? (
        filters.stage === "awaiting" && !otherFilters ? (
          <EmptyState
            icon={PhoneCall}
            title="Hammaga qo'ng'iroq qilindi"
            action={
              <Button variant="outline" onClick={() => changeFilters({ stage: "" })}>
                Barcha javoblar
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="Tanlangan filtrlar bo'yicha javob yo'q"
            action={
              <Button variant="outline" onClick={resetFilters}>
                Filtrlarni tozalash
              </Button>
            }
          />
        )
      ) : (
        <ResponsesTable
          rows={result.data}
          columns={[...result.fields, ...result.legacyFields]}
          loading={loading || pageOverflow}
          offset={(filters.page - 1) * filters.pageSize}
          onToggleCalled={toggleCalled}
          onOpenLead={onOpenLead}
          onRestore={onRestore}
        />
      )}
      <TablePagination
        page={filters.page}
        pageSize={filters.pageSize}
        total={result.total}
        onPageChange={(page) => setFilters({ page })}
        onPageSizeChange={(pageSize) => setFilters({ pageSize, page: 1 })}
      />
    </div>
  );
}

function NoResponsesYet({ slug }: { slug: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed px-4 py-16 text-center">
      <Share2 className="size-8 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium">Hali hech kim ro&apos;yxatdan o&apos;tmadi</p>
        <p className="text-sm text-muted-foreground">
          Havolani Instagram yoki Telegram&apos;da ulashing. Javoblar shu yerda
          paydo bo&apos;ladi.
        </p>
      </div>
      <CopyFormLinkButton slug={slug} label="Havolani nusxalash" />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border px-4 py-12 text-center">
      <Icon className="size-7 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground/80">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

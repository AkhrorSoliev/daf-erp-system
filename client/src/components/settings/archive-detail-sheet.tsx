"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { formatBalance, formatPhone } from "@/lib/format-utils";
import { getStatusConfig } from "@/lib/status-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import {
  archiveReason,
  capRows,
  personName,
  type DetailType,
} from "./archive-detail-rules";

type TabKey = "malumot" | "tarix";

export interface ArchiveDetailSheetProps {
  entityType: DetailType;
  id: string;
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onClose: () => void;
  onRestore: (item: any) => void;
}

const fmt = (d?: string | null) =>
  d ? format(new Date(d), "dd.MM.yyyy, HH:mm") : "—";

function deletedByName(item: any): string {
  const by = item.deletedBy;
  if (!by) return "—";
  return [by.firstName, by.lastName].filter(Boolean).join(" ").trim() || "—";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export function ArchiveDetailSheet({
  entityType,
  id,
  tab,
  onTabChange,
  onClose,
  onRestore,
}: ArchiveDetailSheetProps) {
  const [item, setItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await api.get(`/archive/${entityType}/${id}`);
      setItem(data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [entityType, id]);

  useEffect(() => {
    load();
  }, [load]);

  const isStudent = entityType === "students";
  const title = !item
    ? "Arxivdagi yozuv"
    : isStudent
      ? personName(item)
      : item.name || "Noma'lum";
  const subtitle = isStudent
    ? `O'quvchi · ID ${id} · Arxivda`
    : "Guruh · Arxivda";
  const reason = item ? archiveReason(item) : null;
  const rows = item
    ? capRows(item.enrollments ?? [], item._count?.enrollments ?? 0)
    : { shown: [], hidden: 0 };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : failed || !item ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi</p>
              <Button variant="outline" size="sm" onClick={load}>
                Qayta urinish
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm dark:border-yellow-700 dark:bg-yellow-950/30">
                <Row label="Arxivlangan" value={fmt(item.deletedAt)} />
                <Row label="Kim tomonidan" value={deletedByName(item)} />
                <Row
                  label="Sabab"
                  value={
                    reason ? (
                      <span className="font-medium">{reason}</span>
                    ) : (
                      <span className="text-muted-foreground">Sabab yozilmagan</span>
                    )
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => onRestore(item)}
                >
                  <RotateCcw className="mr-2 size-4" />
                  Qayta tiklash
                </Button>
              </div>

              <Tabs value={tab} onValueChange={(v) => onTabChange(v as TabKey)}>
                <TabsList>
                  <TabsTrigger value="malumot">Ma&apos;lumot</TabsTrigger>
                  <TabsTrigger value="tarix">Tarix</TabsTrigger>
                </TabsList>

                <TabsContent value="malumot" className="space-y-4 pt-2">
                  {isStudent ? (
                    <div className="divide-y">
                      <Row label="Telefon" value={formatPhone(item.phone)} />
                      <Row
                        label="Filial"
                        value={
                          (item.branches ?? [])
                            .map((b: any) => b.branch?.name)
                            .filter(Boolean)
                            .join(", ") || "—"
                        }
                      />
                      <Row label="Balans" value={formatBalance(item.balance ?? 0)} />
                    </div>
                  ) : (
                    <div className="divide-y">
                      <Row label="Kurs" value={item.course?.name ?? "—"} />
                      <Row label="Filial" value={item.branch?.name ?? "—"} />
                      <Row
                        label="Ustoz"
                        value={
                          (item.teachers ?? [])
                            .map((t: any) => personName(t.teacher))
                            .join(", ") || "—"
                        }
                      />
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-sm font-medium">
                      {isStudent
                        ? "Guruhlari"
                        : `O'quvchilari (${item._count?.enrollments ?? rows.shown.length})`}
                    </p>
                    {rows.shown.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Yozilish yo&apos;q</p>
                    ) : (
                      <div className="divide-y text-sm">
                        {rows.shown.map((e: any) => {
                          const st = getStatusConfig("enrollments", e.status);
                          return (
                            <div key={e.id} className="flex items-center justify-between gap-3 py-1.5">
                              <span>{isStudent ? e.group?.name ?? "—" : personName(e.student)}</span>
                              <Badge variant={st.variant}>{st.label}</Badge>
                            </div>
                          );
                        })}
                        {rows.hidden > 0 && (
                          <p className="py-1.5 text-muted-foreground">yana {rows.hidden} ta</p>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="tarix" className="pt-2">
                  {tab === "tarix" && (
                    <EntityHistoryTable
                      entityType={isStudent ? "Student" : "Group"}
                      entityId={id}
                    />
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

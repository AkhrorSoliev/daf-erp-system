"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  enrollmentStatusLabel,
  personName,
  type DetailType,
} from "./archive-detail-rules";
import { useT } from "@/i18n/context";

type TabKey = "malumot" | "tarix";

export interface ArchiveDetailSheetProps {
  entityType: DetailType;
  id: string;
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onClose: () => void;
  onRestore: (item: any) => void;
  restoring?: boolean;
}

const fmt = (d?: string | null) =>
  d ? format(new Date(d), "dd.MM.yyyy, HH:mm") : "—";

const fmtDay = (d?: string | null) => {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : format(dt, "dd.MM.yyyy");
};

// Yozilish sanalari: boshlanishi; faol bo'lmasa — holat o'zgargan kun ham.
function enrollmentRange(e: any): string | null {
  const start = fmtDay(e.startDate ?? e.createdAt);
  if (!start) return null;
  const end = e.status !== "ACTIVE" ? fmtDay(e.statusChangedAt) : null;
  return end ? `${start} — ${end}` : start;
}

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
  restoring = false,
}: ArchiveDetailSheetProps) {
  const t = useT();
  const [item, setItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Eng so'nggi so'rov raqami: eskirgan javob holatni buzmasin.
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const mine = ++reqId.current;
    setItem(null);
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await api.get(`/archive/${entityType}/${id}`);
      if (mine === reqId.current) setItem(data);
    } catch {
      if (mine === reqId.current) setFailed(true);
    } finally {
      if (mine === reqId.current) setLoading(false);
    }
  }, [entityType, id]);

  useEffect(() => {
    load();
    // id/tur o'zgarsa yoki oyna yopilsa, kutilayotgan javob bekor sanaladi
    return () => {
      reqId.current++;
    };
  }, [load]);

  const isStudent = entityType === "students";
  const title = !item
    ? t("Arxivdagi yozuv")
    : isStudent
      ? personName(item, t)
      : item.name || t("Noma'lum");
  const subtitle = isStudent
    ? t("O'quvchi · ID {id} · Arxivda", { id })
    : t("Guruh · Arxivda");
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
              <p className="text-muted-foreground">{t("Ma'lumotni yuklab bo'lmadi")}</p>
              <Button variant="outline" size="sm" onClick={load}>
                {t("Qayta urinish")}
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm dark:border-yellow-700 dark:bg-yellow-950/30">
                <Row label={t("Arxivlangan sana")} value={fmt(item.deletedAt)} />
                <Row label={t("Kim tomonidan")} value={deletedByName(item)} />
                <Row
                  label={t("Sabab")}
                  value={
                    reason ? (
                      <span className="font-medium">{reason}</span>
                    ) : (
                      <span className="text-muted-foreground">{t("Sabab yozilmagan")}</span>
                    )
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={restoring}
                  onClick={() => onRestore(item)}
                >
                  <RotateCcw className="mr-2 size-4" />
                  {t("Qayta tiklash")}
                </Button>
              </div>

              <Tabs value={tab} onValueChange={(v) => onTabChange(v as TabKey)}>
                <TabsList>
                  <TabsTrigger value="malumot">{t("Ma'lumot")}</TabsTrigger>
                  <TabsTrigger value="tarix">{t("Tarix")}</TabsTrigger>
                </TabsList>

                <TabsContent value="malumot" className="space-y-4 pt-2">
                  {isStudent ? (
                    <div className="divide-y">
                      <Row label={t("Telefon")} value={formatPhone(item.phone)} />
                      <Row
                        label={t("Filial")}
                        value={
                          (item.branches ?? [])
                            .map((b: any) => b.branch?.name)
                            .filter(Boolean)
                            .join(", ") || "—"
                        }
                      />
                      <Row label={t("Balans")} value={formatBalance(item.balance ?? 0, t("so'm"))} />
                    </div>
                  ) : (
                    <div className="divide-y">
                      <Row label={t("Kurs")} value={item.course?.name ?? "—"} />
                      <Row label={t("Filial")} value={item.branch?.name ?? "—"} />
                      <Row
                        label={t("Ustoz")}
                        value={
                          (item.teachers ?? [])
                            .map((gt: any) => personName(gt.teacher, t))
                            .join(", ") || "—"
                        }
                      />
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-sm font-medium">
                      {isStudent
                        ? t("Guruhlari")
                        : t("O'quvchilari ({n})", {
                            n: item._count?.enrollments ?? rows.shown.length,
                          })}
                    </p>
                    {rows.shown.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("Yozilish yo'q")}</p>
                    ) : (
                      <div className="divide-y text-sm">
                        {rows.shown.map((e: any) => {
                          const st = getStatusConfig("enrollments", e.status);
                          const range = enrollmentRange(e);
                          const label = enrollmentStatusLabel(e.status);
                          return (
                            <div key={e.id} className="flex items-center justify-between gap-3 py-1.5">
                              <span>
                                {isStudent ? e.group?.name ?? "—" : personName(e.student, t)}
                                {range && (
                                  <span className="block text-xs text-muted-foreground">{range}</span>
                                )}
                              </span>
                              <Badge variant={st.variant}>
                                {label ? t(label) : e.status}
                              </Badge>
                            </div>
                          );
                        })}
                        {rows.hidden > 0 && (
                          <p className="py-1.5 text-muted-foreground">
                            {t("yana {n} ta", { n: rows.hidden })}
                          </p>
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

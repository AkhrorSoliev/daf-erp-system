"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { cn } from "@/lib/utils";
import { MediaFragenPanel } from "./media-fragen-panel";
import { MediaInhaltPanel } from "./media-inhalt-panel";
import type {
  MediaCoverageOverview,
  MediaSectionCoverage,
  MediaUnitCoverage,
} from "./media-coverage-types";
import {
  type CoverageStatus,
  coverageLabel,
  coverageStatus,
  sectionStatuses,
  unitHasNoMaterial,
  unitTotals,
  worstStatus,
} from "./media-coverage-utils";

const STATUS_DOT: Record<CoverageStatus, string> = {
  complete: "bg-emerald-500",
  partial: "bg-amber-500",
  none: "bg-rose-500",
  na: "bg-muted-foreground/30",
};

const STATUS_LEGEND: { status: CoverageStatus; label: string }[] = [
  { status: "complete", label: "To'liq" },
  { status: "partial", label: "Qisman" },
  { status: "none", label: "Hali yo'q" },
  { status: "na", label: "Kerak emas" },
];

function CoverageCell({
  status,
  have,
  total,
}: {
  status: CoverageStatus;
  have: number;
  total: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[status])}
      />
      {coverageLabel(have, total)}
    </span>
  );
}

/** Bo'lim jadvalidagi ustunlar soni — pastdagi kengaytirilgan qator shuncha ustunni bosib o'tadi. */
const SECTION_COLUMN_COUNT = 7;

function SectionRow({ s, index }: { s: MediaSectionCoverage; index: number }) {
  // Rangni ham, `pictureEligible`/`total` kabi kamchilik nisbatini ham BIR
  // joydan — `sectionStatuses`dan — olamiz. Har bir hujayra o'zicha
  // `coverageStatus(have, total)` chaqirganda, `have`/`total` juftligini
  // shu yerda xato ustunga almashtirib qo'yish (masalan rasm ustuniga
  // `s.words.total`ni) hech qanday testda ko'rinmasdi — `sectionStatuses`
  // media-coverage-utils.test.ts'da sinaladi, shuning uchun rang shu orqali
  // kelishi kerak, mustaqil hisoblanmasligi kerak.
  const status = sectionStatuses(s);
  // Bo'lim qatori bosilganda material paneli ochiladi. Panel FAQAT `open`
  // paytida render qilinadi — shuning uchun `GET .../inhalt` yopiq bo'lim
  // uchun umuman so'ralmaydi (brief: "yopiq bo'lim hech narsa yuklamaydi").
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  return (
    <>
      <TableRow
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="cursor-pointer hover:bg-muted/50"
      >
        <TableCell className="w-12 border-r text-muted-foreground">
          <span className="flex items-center gap-1">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            {index + 1}
          </span>
        </TableCell>
        <TableCell>
          <div className="font-medium">{s.titleUz}</div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {s.code}
          </div>
        </TableCell>
        <TableCell>
          <CoverageCell
            status={status.wordsAudio}
            have={s.words.withAudio}
            total={s.words.total}
          />
        </TableCell>
        <TableCell>
          <CoverageCell
            status={status.wordsImage}
            have={s.words.withImage}
            total={s.words.pictureEligible}
          />
        </TableCell>
        <TableCell>
          <CoverageCell
            status={status.sentences}
            have={s.sentences.withAudio}
            total={s.sentences.total}
          />
        </TableCell>
        <TableCell>
          <CoverageCell
            status={status.phrases}
            have={s.phrases.withAudio}
            total={s.phrases.total}
          />
        </TableCell>
        <TableCell>
          <CoverageCell
            status={status.dialogLines}
            have={s.dialogLines.withAudio}
            total={s.dialogLines.total}
          />
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={SECTION_COLUMN_COUNT} className="bg-muted/20 p-0">
            <MediaInhaltPanel sectionId={s.sectionId} />
            {/* Ikkalasi ham FAQAT bo'lim ochilganda so'raladi (`open`) —
                material "nima bor"ni ko'rsatadi, savollar dvigatel undan
                "nima quradi"ni. Bitta so'rov ikkinchisini bloklamasin deb
                ikkala panel MUSTAQIL fetch qiladi — biri sekinlashsa
                ikkinchisi kutib turmaydi. */}
            <div className="border-t px-4 pt-4">
              <h3 className="text-sm font-semibold">
                Savollar (oldindan ko&apos;rish)
              </h3>
              <p className="text-xs text-muted-foreground">
                Dvigatel shu bo&apos;lim + shu unitdagi undan oldingi
                bo&apos;limlar materialidan quradigan barcha savol —
                to&apos;g&apos;ri javobi bilan. Ko&apos;lam yuqoridagi
                material panelidan KENGROQ — tafsilot pastdagi &quot;Ko&apos;lam&quot;
                yorlig&apos;ida.
              </p>
            </div>
            <MediaFragenPanel sectionId={s.sectionId} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function UnitBlock({
  unit,
  defaultOpen,
}: {
  unit: MediaUnitCoverage;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // `empty` ("hech qanday material yo'q") va `noSections` ("hatto bo'lim
  // ro'yxati ham yo'q") ATAYLAB ikki xil holat: bo'limlari seedlangan-u,
  // material hali yozilmagan unit ("mana shu unitning bo'limlari, hammasi
  // nol") ochilishi kerak — aks holda o'sha bo'lim ro'yxatining o'zi
  // ko'rinmay qoladi, holbuki aynan shuni ko'rish uchun sahifa ochiladi.
  // Faqat bo'lim RO'YXATI ham yo'q bo'lganda ko'rsatadigan jadval yo'q.
  const noSections = unit.sections.length === 0;
  const empty = unitHasNoMaterial(unit);
  const totals = unitTotals(unit);
  const worst = worstStatus([
    coverageStatus(totals.words.withAudio, totals.words.total),
    coverageStatus(totals.words.withImage, totals.words.pictureEligible),
    coverageStatus(totals.sentences.withAudio, totals.sentences.total),
    coverageStatus(totals.phrases.withAudio, totals.phrases.total),
    coverageStatus(totals.dialogLines.withAudio, totals.dialogLines.total),
  ]);

  return (
    <Collapsible
      open={open && !noSections}
      onOpenChange={setOpen}
      className="rounded-lg border"
    >
      <CollapsibleTrigger
        disabled={noSections}
        className={cn(
          "flex w-full items-center gap-3 p-3 text-left",
          !noSections && "hover:bg-muted/50",
        )}
      >
        {noSections ? (
          <span className="h-4 w-4 shrink-0" />
        ) : open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {unit.order}-unit — {unit.titleUz}
            </span>
            {unit.code && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {unit.code}
              </span>
            )}
          </div>
          {noSections ? (
            <div className="text-xs text-muted-foreground">
              Hali bo&apos;lim yaratilmagan
            </div>
          ) : empty ? (
            <div className="text-xs text-muted-foreground">
              {unit.sections.length} ta bo&apos;lim — hali hech qanday
              material yo&apos;q
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {unit.sections.length} ta bo&apos;lim · {totals.words.total}{" "}
              so&apos;z · {totals.sentences.total} gap ·{" "}
              {totals.phrases.total} ibora · {totals.dialogLines.total} dialog
              qatori
            </div>
          )}
        </div>
        {!empty && (
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              STATUS_DOT[worst],
            )}
            title="Ushbu unitdagi eng zaif ko'rsatkich"
          />
        )}
      </CollapsibleTrigger>

      {!noSections && (
        <CollapsibleContent>
          <div className="border-t">
            {/* Sahifalash yo'q, client/CLAUDE.md'dagi "istisnosiz" qoidaga
                qaramay — ATAYLAB: kurs dizayni bitta unitga amalda ~6 tadan
                ortiq bo'lim qo'ymaydi, shuning uchun bu jadval hech qachon
                sahifalashni talab qiladigan uzunlikka yetmaydi. Unit soni
                o'sishi mumkin (har biri o'z <UnitBlock>ida), lekin BITTA
                unit ichidagi bo'lim soni emas — agar bu taxmin kelajakda
                noto'g'ri chiqsa (masalan unit qayta bo'linsa), shu yerga
                sahifalash qo'shiladi. */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Bo&apos;lim</TableHead>
                  <TableHead>So&apos;z — ovoz</TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger className="cursor-default">
                        So&apos;z — rasm
                      </TooltipTrigger>
                      <TooltipContent>
                        Faqat rasm chizib bo&apos;ladigan (picturable) so&apos;zlar
                        hisoblanadi — mavhum so&apos;zlarga rasm kerak emas.
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>Gap — ovoz</TableHead>
                  <TableHead>Ibora — ovoz</TableHead>
                  <TableHead>Dialog qatori — ovoz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unit.sections.map((s, i) => (
                  <SectionRow key={s.sectionId} s={s} index={i} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

/**
 * `/media` sahifasining bazadan o'zi to'ladigan bo'limi.
 *
 * Yuqoridagi eski bo'lim `content/daf/*.json` manifestini o'qiydi — u yerga
 * hech qanday generatsiya skripti yozmaydi, shuning uchun sahifa hech qachon
 * o'z-o'zidan yangilanmasdi. Bu bo'lim `GET /daf/media/coverage` orqali
 * to'g'ridan-to'g'ri `Daf*` kontent jadvallarini o'qiydi, shuning uchun yangi
 * audio/rasm kaliti yozilishi bilanoq shu yerda ko'rinadi.
 */
export function MediaCoverageSection() {
  const [data, setData] = useState<MediaCoverageOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Qayta urinib ko'rish" bosilganda effektni qayta yugurtirish uchun —
  // client/CLAUDE.md talab qiladigan "xato holati qayta urinish imkonini
  // berishi kerak" qoidasi shu orqali bajariladi. `loading` alohida state
  // emas — `data`/`error` ikkalasi ham hali kelmagan payt shuning o'zi.
  const [retryKey, setRetryKey] = useState(0);
  const loading = !data && !error;

  useEffect(() => {
    let cancelled = false;
    api
      .get<MediaCoverageOverview>("/daf/media/coverage")
      .then(({ data }) => {
        if (!cancelled) setData(data);
      })
      .catch(() => {
        if (!cancelled) setError("Qamrov ma'lumoti olinmadi");
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const handleRetry = useCallback(() => {
    setData(null);
    setError(null);
    setRetryKey((k) => k + 1);
  }, []);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Kurs qamrovi</h2>
          <p className="text-sm text-muted-foreground">
            Har bir unit va bo&apos;lim bo&apos;yicha nechta so&apos;z, gap,
            ibora va dialog qatori bor — va ulardan qanchasida ovoz yoki rasm
            tayyor. Bazadan avtomatik.
          </p>
        </div>
        {!loading && !error && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {STATUS_LEGEND.map(({ status, label }) => (
              <span key={status} className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    STATUS_DOT[status],
                  )}
                />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!loading && error && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Qayta urinib ko&apos;rish
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && (
        <div className="space-y-4">
          {data.levels.length === 0 && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Hali hech qanday unit yaratilmagan — kontentni bazaga
                yozadigan seed skriptini (`daf:seed`/`daf:inhalt-seed`) ishga
                tushiring.
              </CardContent>
            </Card>
          )}
          {data.levels.map((lvl) => (
            <div key={lvl.level} className="space-y-2">
              {data.levels.length > 1 && (
                <div className="text-sm font-semibold text-muted-foreground">
                  {lvl.level}
                </div>
              )}
              {lvl.units.map((u, i) => (
                <UnitBlock key={u.unitId} unit={u} defaultOpen={i === 0} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

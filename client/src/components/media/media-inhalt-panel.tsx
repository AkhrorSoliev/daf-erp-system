"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OvozTugmasi } from "@/components/student-portal/lernen/uebung/ovoz-tugmasi";
import { sectionInhaltBosh, wortMatni } from "./media-inhalt-utils";
import type {
  InhaltDialogZeile,
  InhaltWort,
  InhaltZeile,
  SectionInhalt,
} from "./media-inhalt-types";

/** Audio ustuni: manzil bo'lsa tugma, bo'lmasa oddiy chiziqcha. */
function OvozHujayrasi({ url }: { url: string | null }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  // `autoPlay={false}`: bu ro'yxat, mashq ekrani emas — bo'lim ochilishi
  // bilan o'nlab audio birdan yangramasin (brief §"avtomatik qo'ymaydi").
  // `compact`: mashq ekranidagi katta doira tugma jadval qatoriga sig'maydi.
  return <OvozTugmasi url={url} autoPlay={false} compact />;
}

function WoerterBlock({ woerter }: { woerter: InhaltWort[] }) {
  if (woerter.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">So&apos;zlar</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nemischa</TableHead>
            <TableHead>Tarjima</TableHead>
            <TableHead className="w-14">Ovoz</TableHead>
            <TableHead className="w-24">Holat</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {woerter.map((w) => (
            <TableRow key={w.id}>
              <TableCell className="font-medium">{wortMatni(w)}</TableCell>
              <TableCell className="text-muted-foreground">
                {w.uz ?? "—"}
              </TableCell>
              <TableCell>
                <OvozHujayrasi url={w.audioUrl} />
              </TableCell>
              <TableCell>
                {!w.core && (
                  <Badge
                    variant="outline"
                    className="text-muted-foreground"
                    title="Bu so'zdan hech qachon savol tuzilmaydi va chalg'ituvchi sifatida ham ishlatilmaydi — shuning uchun mashqda ko'rinmaydi"
                  >
                    Passiv
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Gap va ibora bir xil shaklda: nemischa, tarjima, ovoz. */
function ZeileBlock({ title, rows }: { title: string; rows: InhaltZeile[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nemischa</TableHead>
            <TableHead>Tarjima</TableHead>
            <TableHead className="w-14">Ovoz</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.de}</TableCell>
              <TableCell className="text-muted-foreground">{r.uz}</TableCell>
              <TableCell>
                <OvozHujayrasi url={r.audioUrl} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DialogBlock({ rows }: { rows: InhaltDialogZeile[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Dialog qatorlari</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">So&apos;zlovchi</TableHead>
            <TableHead>Nemischa</TableHead>
            <TableHead>Tarjima</TableHead>
            <TableHead className="w-14">Ovoz</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-muted-foreground">
                {r.sprecher}
              </TableCell>
              <TableCell className="font-medium">{r.de}</TableCell>
              <TableCell className="text-muted-foreground">{r.uz}</TableCell>
              <TableCell>
                <OvozHujayrasi url={r.audioUrl} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Bitta bo'limning to'liq materiali — `MediaCoverageSection` bo'lim qatorini
 * ochganda shu yerga tushadi. Qamrov jadvali "nechta" deydi; bu panel
 * "nima" ni ko'rsatadi: har bir so'z/gap/ibora/dialog qatorini, tinglash
 * uchun tugma bilan — bu panelning butun maqsadi (53 ovoz yozildi-yu,
 * ularni birma-bir eshitib tekshirishning boshqa yo'li yo'q edi).
 */
export function MediaInhaltPanel({ sectionId }: { sectionId: number }) {
  const [data, setData] = useState<SectionInhalt | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Qayta urinib ko'rish" effektni qayta yugurtiradi — `MediaCoverageSection`
  // dagi bilan bir xil naqsh.
  const [retryKey, setRetryKey] = useState(0);
  const loading = !data && !error;

  // Bu komponent FAQAT bo'lim ochilganda DOM'ga qo'shiladi (qarang:
  // `media-coverage-section.tsx`) — shuning uchun "faqat ochiq bo'lim
  // so'raydi" qoidasi alohida bayroqsiz, oddiy mount-based fetch bilan
  // bajariladi: yopiq bo'lim bu komponentni umuman render qilmaydi.
  useEffect(() => {
    let cancelled = false;
    api
      .get<SectionInhalt>(`/daf/media/sections/${sectionId}/inhalt`)
      .then(({ data }) => {
        if (!cancelled) setData(data);
      })
      .catch(() => {
        if (!cancelled) setError("Bo'lim materiali olinmadi");
      });
    return () => {
      cancelled = true;
    };
  }, [sectionId, retryKey]);

  const handleRetry = useCallback(() => {
    setData(null);
    setError(null);
    setRetryKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6 p-4">
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded" />
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

      {!loading && !error && data && sectionInhaltBosh(data) && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Bu bo&apos;limda hali material yo&apos;q — kontentni bazaga
            yozadigan seed skriptini (`daf-seed`/`inhalt-seed`) ishga
            tushiring.
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && !sectionInhaltBosh(data) && (
        <>
          <WoerterBlock woerter={data.woerter} />
          <ZeileBlock title="Gaplar" rows={data.saetze} />
          <ZeileBlock title="Iboralar" rows={data.phrasen} />
          <DialogBlock rows={data.dialogZeilen} />
        </>
      )}
    </div>
  );
}

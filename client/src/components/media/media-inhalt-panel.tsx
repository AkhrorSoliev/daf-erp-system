"use client";

import { useQuery } from "@tanstack/react-query";
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
  // `useQuery` — oddiy `useState`+`useEffect` emas, ATAYLAB: bu panel
  // `/media/sections/[id]`da "Material" YORLIG'I ichida turadi, va Radix
  // `<Tabs>` default holatda faol bo'lmagan `<TabsContent>`ni DOM'dan olib
  // tashlaydi — demak "Savollar"ga o'tib qaytganda bu komponent QAYTA
  // MOUNT bo'ladi. Xom `useState` bilan bu HAR SAFAR qayta so'rov +
  // skeleton yaltirashi degani edi (ko'rik: Minor topilma — tablar aynan
  // shu ikki tomon orasida tez-tez ko'chib yurish uchun tanlangan, "bu
  // so'z g'alati eshitildi — savoli qanday ekan?"). `QueryProvider`dagi
  // global `staleTime` (5 daqiqa) tufayli xuddi shu `sectionId` bilan
  // qayta mount bo'lganda keshdan darhol o'qiydi — tarmoqqa so'rov
  // yubormasdan, yaltirashsiz. Bo'lim yopiq bo'lsa bu komponent umuman
  // render qilinmaydi (`media-coverage-section.tsx`), shuning uchun
  // "faqat ochiq bo'lim so'raydi" qoidasi buzilmaydi — birinchi mount
  // hamon bitta tarmoq so'rovi.
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["media-inhalt", sectionId],
    queryFn: () =>
      api
        .get<SectionInhalt>(`/daf/media/sections/${sectionId}/inhalt`)
        .then((r) => r.data),
  });

  return (
    <div className="space-y-6 p-4">
      {/* Ko'lam yorlig'i — bu panel ("Material" yorlig'i) va "Savollar"
          yorlig'i BOSHQA-BOSHQA to'plamni sanaydi (bu — faqat shu bo'lim;
          savollar — shu bo'lim + undan oldingi barchasi). Ikkalasi
          bo'lim sahifasida ikkita alohida YORLIQ (`section-detail-client.tsx`)
          — stacked emas, shuning uchun bu izoh "pastda/yuqorida" emas,
          ikkinchi yorliqning nomini aytadi. Yorliqsiz o'quvchi ikkalasini
          bir xil ro'yxat deb o'ylab, sonlar mos kelmasa (masalan
          `ZUORDNEN` variantida bu yerda yo'q ibora chiqsa) sahifani buzuq
          deb hisoblardi — aslida ikkalasi ham to'g'ri, faqat ko'lami
          boshqa. */}
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Ko&apos;lam:</span>{" "}
        faqat SHU bo&apos;limning materiali. Oldingi bo&apos;limlarga
        tegishli so&apos;z, gap yoki ibora bu ro&apos;yxatda
        ko&apos;rinmaydi — &quot;Savollar&quot; yorlig&apos;i esa ularni
        ham hisobga oladi.
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded" />
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
            <span>Bo&apos;lim materiali olinmadi</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Qayta urinib ko&apos;rish
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && sectionInhaltBosh(data) && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Bu bo&apos;limda hali material yo&apos;q — kontentni bazaga
            yozadigan seed skriptini (`daf:seed`/`daf:inhalt-seed`) ishga
            tushiring.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && !sectionInhaltBosh(data) && (
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

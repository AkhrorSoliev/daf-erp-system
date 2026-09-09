"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import { MediaFragenPanel } from "./media-fragen-panel";
import { MediaInhaltPanel } from "./media-inhalt-panel";
import { engKopSavolliFormat, tanlanganTab } from "./section-detail-utils";
import type { FrageFormat } from "./media-fragen-types";

/**
 * Sahifa sarlavhasi uchun kerakli maydonlar — `SectionInhalt`ning
 * to'liq shakli (`media-inhalt-types.ts`) emas, ATAYLAB shu 4 tasi.
 * `MediaInhaltPanel` bir xil yo'lni to'liq material bilan o'zi qayta
 * so'raydi (brief: uni qayta yozmaslik) — bu yerdagi so'rov faqat
 * sarlavha uchun, ikkinchisiga bog'liq emas.
 */
interface SectionBoshi {
  sectionCode: string;
  sectionTitleUz: string;
  unitCode: string | null;
  unitTitleUz: string;
}

/** Sarlavha yuklanayotganda — matn qatorlari o'rnida skeleton. */
function BoshiSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-72" />
    </div>
  );
}

/**
 * Bo'lim topilmasa (404) yoki so'rov muvaffaqiyatsiz bo'lsa — bo'sh
 * ekran emas, orqaga qaytaradigan aniq xabar (`client/CLAUDE.md`: bo'sh
 * holat harakatga chorlaydi).
 */
function BoshiXato({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
        <span>
          Bu bo&apos;lim topilmadi yoki ma&apos;lumoti olinmadi — manzil
          noto&apos;g&apos;ri bo&apos;lishi mumkin.
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Qayta urinib ko&apos;rish
          </Button>
          <Button asChild size="sm">
            <Link href="/media">Media ro&apos;yxatiga qaytish</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * `/media/sections/[id]` — bitta bo'limning sahifasi (dizayn:
 * `docs/superpowers/specs/2026-09-09-media-tuzilishi-design.md` §3).
 *
 * `/media` bir vaqtning o'zida 13 obraz, 47 fayl, 18 unitlik qamrov
 * jadvali VA (bo'lim ochilsa) o'sha bo'limning ~340 tagacha savolini bitta
 * sahifada ko'rsatardi. Bu sahifa mavzusi BITTA — shu bo'lim. Material va
 * savollar o'sha bir narsaning ikki ko'rinishi (ko'pincha ikkalasi birga
 * kerak: "bu so'z g'alati eshitildi — savoli qanday ekan?"), shuning
 * uchun ikki alohida sahifa emas, ikkita YORLIQ (`?tab=`).
 */
export function SectionDetailClient({ sectionId }: { sectionId: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setName = useBreadcrumbName((s) => s.setName);

  const [boshi, setBoshi] = useState<SectionBoshi | null>(null);
  const [boshiXato, setBoshiXatoState] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const boshiLoading = !boshi && !boshiXato;

  // Formatlar ro'yxati `MediaFragenPanel`dan keladi (`onFormatsLoaded`) —
  // ikkinchi marta `/fragen`ga so'rov yubormasdan, "sukut format qaysi
  // edi" savoliga shu yerda ham javob berish uchun (pastdagi
  // `handleSelectFormat`da kerak).
  const [formatlar, setFormatlar] = useState<
    { format: FrageFormat; soni: number }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<SectionBoshi>(`/daf/media/sections/${sectionId}/inhalt`)
      .then(({ data }) => {
        if (cancelled) return;
        setBoshi(data);
        // Breadcrumb'dagi raqam o'rniga bo'lim nomi — loyiha qoidasi
        // (`client/CLAUDE.md`: "Breadcrumbs").
        setName(String(sectionId), data.sectionTitleUz);
      })
      .catch(() => {
        if (!cancelled) setBoshiXatoState(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionId, retryKey, setName]);

  const handleRetry = useCallback(() => {
    setBoshi(null);
    setBoshiXatoState(false);
    setRetryKey((k) => k + 1);
  }, []);

  const tab = tanlanganTab(searchParams.get("tab"));
  const formatParam = searchParams.get("format");

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      // Sukut ("material") manzilga yozilmaydi — `client/CLAUDE.md`:
      // "Omit the default tab from the URL".
      if (value === "material") {
        params.delete("tab");
        // `?format=` faqat "Savollar" yorlig'ida ma'no anglatadi. Uni
        // "Material"ga o'tganda ham manzilda qoldirish — ishlatilmaydigan
        // holatni tashib yurish (ko'rik: Minor topilma) — sukutlar
        // manzilda bo'lmasligi kerak degan qoidaning o'zi.
        params.delete("format");
      } else {
        params.set("tab", value);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handleFormatsLoaded = useCallback(
    (yangi: { format: FrageFormat; soni: number }[]) => {
      setFormatlar(yangi);
    },
    [],
  );

  const handleSelectFormat = useCallback(
    (format: FrageFormat) => {
      const params = new URLSearchParams(searchParams.toString());
      // Bosilgan format aynan "eng ko'p savolli" (sukut) bilan bir xil
      // bo'lsa, manzilga yozilmaydi — tab bilan bir xil qoida, boshqa
      // odam shu formatni ochsa ham manzil qisqa qolsin.
      const sukut = engKopSavolliFormat(
        formatlar.map((f) => [f.format, f.soni] as [FrageFormat, number]),
      );
      if (format === sukut) {
        params.delete("format");
      } else {
        params.set("format", format);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [formatlar, pathname, router, searchParams],
  );

  if (boshiLoading) {
    return (
      <div className="space-y-6">
        <BoshiSkeleton />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (boshiXato || !boshi) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/media">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Media
          </Link>
        </Button>
        <BoshiXato onRetry={handleRetry} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/media">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Media
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">
            {boshi.unitTitleUz} → {boshi.sectionTitleUz}
          </h1>
          <Badge variant="outline" className="font-mono text-[11px]">
            {boshi.sectionCode}
          </Badge>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="material">Material</TabsTrigger>
          <TabsTrigger value="savollar">Savollar</TabsTrigger>
        </TabsList>
        <TabsContent value="material">
          <MediaInhaltPanel sectionId={sectionId} />
        </TabsContent>
        <TabsContent value="savollar">
          <MediaFragenPanel
            sectionId={sectionId}
            selectedFormat={formatParam}
            onSelectFormat={handleSelectFormat}
            onFormatsLoaded={handleFormatsLoaded}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

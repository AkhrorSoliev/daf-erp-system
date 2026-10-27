"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FolderArchive, Swords } from "lucide-react";
import api from "@/lib/api";
import { useT } from "@/i18n/context";
import { MediaCoverageSection } from "./media-coverage-section";
import { jamiSonlar } from "./media-jang-utils";
import type { JangOverview } from "./media-jang-types";

/**
 * «Jang savollari» sahifasiga havola. Savollar soni `/media/jang` bilan BIR
 * XIL so'rovdan keladi (bir xil kalit), shuning uchun sahifaga o'tganda
 * qayta yuklanmaydi.
 */
function JangLink() {
  const t = useT();
  const { data } = useQuery({
    queryKey: ["media-jang"],
    queryFn: () => api.get<JangOverview>("/daf/media/jang").then((r) => r.data),
  });
  const jami = data ? jamiSonlar(data.units).jami : null;
  return (
    <Link
      href="/media/jang"
      className="flex items-center gap-3 rounded-xl border bg-card p-4 transition hover:bg-muted/50"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Swords className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{t("Jang savollari")}</span>
        <span className="block text-xs text-muted-foreground">
          {jami === null
            ? t("Barcha jang savollarini unit bo'yicha o'qib chiqish")
            : t("{n} ta savol — unit bo'yicha o'qib chiqish", { n: jami })}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function MediaClient() {
  const t = useT();
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Media")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Kurs qamrovi — nima tayyor, nima yo'q va qayerda.")}
          </p>
        </div>
        {/* Obrazlar va 47 fayl kurs kontenti emas — eski quvurning
            natijasi. Qamrov jadvali ustida turishi diqqatni chalg'itardi,
            shuning uchun alohida sahifada, bu yerdan bitta havola bilan. */}
        <Link
          href="/media/assets"
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-muted/50"
        >
          <FolderArchive className="h-4 w-4 text-muted-foreground" />
          {t("Media fayllari")}
        </Link>
      </div>

      <JangLink />

      <MediaCoverageSection />
    </div>
  );
}

"use client";

import Link from "next/link";
import { FolderArchive } from "lucide-react";
import { MediaCoverageSection } from "./media-coverage-section";

export function MediaClient() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Media</h1>
          <p className="text-sm text-muted-foreground">
            Kurs qamrovi — nima tayyor, nima yo&apos;q va qayerda.
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
          Media fayllari
        </Link>
      </div>

      <MediaCoverageSection />
    </div>
  );
}

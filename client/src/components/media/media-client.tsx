"use client";

import Link from "next/link";
import {
  BookOpen,
  ClipboardList,
  FolderArchive,
  Sparkles,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MediaCoverageSection } from "./media-coverage-section";

/** Kelajakdagi imkoniyatlar — hozircha faqat e'lon, bosilmaydi. */
const TEZ_KUNDA = [
  { icon: Sparkles, title: "Kontent yasash", desc: "Matnni o'zingiz yozasiz yoki AI yozib beradi" },
  { icon: BookOpen, title: "Dars yasash", desc: "Bo'limni qo'lda yig'ish: matn, audio, rasm, mashq" },
  { icon: ClipboardList, title: "Test yasash", desc: "Mashq turini tanlab, savollarni tuzish" },
  { icon: Video, title: "Video darslar", desc: "Videoga subtitr va mashq biriktirish" },
];

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

      <div>
        <h2 className="mb-1 text-lg font-semibold">Tez kunda</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Bu imkoniyatlar tayyorlanmoqda.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TEZ_KUNDA.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="border-dashed">
              <CardContent className="space-y-1.5 p-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
                <Badge variant="outline" className="text-[10px]">
                  tez kunda
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

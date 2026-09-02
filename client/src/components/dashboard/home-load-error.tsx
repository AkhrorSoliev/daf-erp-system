"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * BUTUN so'rov yiqilganda chiziladi — bitta blok emas.
 *
 * `HomeErrorNote` dan farqi shu: u bitta bo'lim ma'lumoti kelmaganda o'sha
 * blok o'rniga qo'yiladi, bu esa sahifada umuman ma'lumot bo'lmaganda.
 * Ilgari bu holatda sahifa abadiy skeleton ko'rsatardi — foydalanuvchi
 * kulrang to'rtburchaklarga qarab o'tirardi va sabab aytilmasdi.
 */
export function HomeLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <TriangleAlert className="size-8 text-orange-600 dark:text-orange-400" />
      <div>
        <p className="text-base font-medium">Ma&apos;lumot yuklanmadi</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Server javob bermadi. Internet aloqangizni tekshiring yoki qaytadan
          urinib ko&apos;ring.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw className="mr-1.5 size-4" />
        Qayta urinish
      </Button>
    </div>
  );
}

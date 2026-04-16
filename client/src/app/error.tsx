"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[App Error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <div className="relative mb-6">
          <span className="text-[10rem] font-bold leading-none tracking-tighter text-destructive/10 select-none sm:text-[14rem]">
            500
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-destructive/10 p-5">
              <TriangleAlert className="size-10 text-destructive" />
            </div>
          </div>
        </div>

        <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">
          Kutilmagan xatolik yuz berdi
        </h1>
        <p className="mb-8 max-w-md text-muted-foreground">
          Nimadir noto&apos;g&apos;ri ketdi. Iltimos, qayta urinib
          ko&apos;ring yoki bosh sahifaga qayting.
        </p>

        <div className="flex gap-3">
          <Button variant="outline" size="lg" onClick={reset}>
            <RefreshCw data-icon="inline-start" />
            Qayta urinish
          </Button>
          <Button asChild size="lg">
            <Link href="/">
              <ArrowLeft data-icon="inline-start" />
              Bosh sahifa
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

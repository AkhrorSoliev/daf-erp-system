"use client";

import { useEffect } from "react";
import { Geist, Inter } from "next/font/google";

const interHeading = Inter({ subsets: ["latin"], variable: "--font-heading" });
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Global Error]", error);
  }, [error]);

  return (
    <html
      lang="uz"
      className={`h-full antialiased ${geistSans.variable} ${interHeading.variable}`}
    >
      <body className="flex min-h-full flex-col items-center justify-center bg-background px-4 text-center text-foreground">
        <div className="relative mb-6">
          <span className="text-[10rem] font-bold leading-none tracking-tighter text-red-500/10 select-none sm:text-[14rem]">
            500
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-red-500/10 p-5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-10 text-red-500"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            </div>
          </div>
        </div>

        <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">
          Tizimda jiddiy xatolik yuz berdi
        </h1>
        <p className="mb-8 max-w-md text-muted-foreground">
          Ilova yuklanishda xatolik yuz berdi. Iltimos, sahifani qayta yuklang.
        </p>

        <button
          onClick={reset}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          Sahifani qayta yuklash
        </button>
      </body>
    </html>
  );
}

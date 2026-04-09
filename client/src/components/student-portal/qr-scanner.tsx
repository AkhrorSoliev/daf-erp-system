"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, RotateCcw, Camera } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

type ScanState = "scanning" | "loading" | "success" | "error";

interface ScanResult {
  message: string;
  status?: string;
  alreadyMarked?: boolean;
  groupName?: string;
  lessonNumber?: number;
}

export function QrScanner() {
  const router = useRouter();
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [cameraError, setCameraError] = useState(false);

  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const processingRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // Html5QrcodeScannerState: SCANNING = 2
        if (state === 2) {
          await scannerRef.current.stop();
        }
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
  }, []);

  const handleScan = useCallback(
    async (decodedText: string) => {
      if (processingRef.current) return;
      processingRef.current = true;

      setScanState("loading");

      // Vibratsiya
      try {
        navigator.vibrate?.(100);
      } catch {
        // not supported
      }

      try {
        const parsed = JSON.parse(decodedText);
        if (!parsed.t) throw new Error("Invalid QR");

        const { data } = await api.post("/student-portal/attendance/scan", {
          token: parsed.t,
        });

        setResult(data);
        setScanState("success");
        await stopScanner();

        // Muvaffaqiyat vibratsiya
        try {
          navigator.vibrate?.(200);
        } catch {
          // not supported
        }
      } catch (err: any) {
        const raw = (err as any)?.response?.data?.message;
        const msg = Array.isArray(raw) ? raw[0] : (raw || "QR kodni o'qishda xatolik yuz berdi");
        setErrorMessage(msg);
        setScanState("error");
        await stopScanner();

        // Xato vibratsiya
        try {
          navigator.vibrate?.([100, 50, 100]);
        } catch {
          // not supported
        }
      }
    },
    [stopScanner]
  );

  const startScanner = useCallback(async () => {
    processingRef.current = false;
    setScanState("scanning");
    setResult(null);
    setErrorMessage("");
    setCameraError(false);

    // Dinamik import qilamiz (SSR da ishlamasligi uchun)
    const { Html5Qrcode } = await import("html5-qrcode");

    await stopScanner();

    const scannerId = "qr-reader";
    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          handleScan(decodedText);
        },
        () => {
          // QR topilmadi — ignore
        }
      );
    } catch {
      setCameraError(true);
      setScanState("error");
      setErrorMessage("Kameraga ruxsat berilmadi yoki kamera topilmadi");
    }
  }, [handleScan, stopScanner]);

  useEffect(() => {
    startScanner();

    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = () => {
    startScanner();
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push("/portal")}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-base font-semibold">QR Davomat</h1>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-4">
        {/* Scanner / Natija */}
        {scanState === "scanning" || scanState === "loading" ? (
          <div className="w-full max-w-sm space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              {scanState === "loading"
                ? "Tekshirilmoqda..."
                : "O'qituvchi ko'rsatgan QR kodni skanerlang"}
            </p>

            {/* Kamera oynasi */}
            <div className="relative overflow-hidden rounded-2xl border-2 border-primary/20">
              <div
                id="qr-reader"
                ref={containerRef}
                className={cn(
                  "w-full",
                  scanState === "loading" && "opacity-50"
                )}
              />
              {scanState === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
                </div>
              )}
            </div>

            {cameraError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                <Camera className="mx-auto mb-2 size-8" />
                Kameraga ruxsat bering va qayta urinib ko&apos;ring
              </div>
            )}
          </div>
        ) : scanState === "success" ? (
          <div className="w-full max-w-sm space-y-6 text-center">
            <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="size-10 text-green-600 dark:text-green-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-green-700 dark:text-green-400">
                {result?.alreadyMarked
                  ? "Davomat allaqachon belgilangan"
                  : "Davomat belgilandi!"}
              </h2>
              {result?.groupName && (
                <p className="text-sm text-muted-foreground">
                  {result.groupName}
                </p>
              )}
              {result?.lessonNumber && (
                <p className="text-lg font-bold text-primary">
                  {result.lessonNumber}-dars
                </p>
              )}
            </div>
          </div>
        ) : scanState === "error" ? (
          <div className="w-full max-w-sm space-y-6 text-center">
            <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <XCircle className="size-10 text-red-600 dark:text-red-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">
                Xatolik
              </h2>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            </div>
            <Button variant="outline" onClick={handleRetry} className="gap-2">
              <RotateCcw className="size-4" />
              Qayta urinish
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  XCircle,
  ArrowClockwise,
  Camera,
} from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { Button } from "./lumio";

type ScanState = "scanning" | "loading" | "success" | "error";

interface ScanResult {
  message: string;
  status?: string;
  alreadyMarked?: boolean;
  groupName?: string;
  lessonNumber?: number;
}

interface QrScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QrScanDialog({ open, onOpenChange }: QrScanDialogProps) {
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

        try {
          navigator.vibrate?.(200);
        } catch {
          // not supported
        }
      } catch (err) {
        setErrorMessage(getErrorMessage(err, "QR kodni o'qishda xatolik yuz berdi"));
        setScanState("error");
        await stopScanner();

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

    const { Html5Qrcode } = await import("html5-qrcode");

    await stopScanner();

    const scannerId = "qr-dialog-reader";
    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1,
        },
        (decodedText) => {
          handleScan(decodedText);
        },
        () => {
          // QR topilmadi
        }
      );
    } catch {
      setCameraError(true);
      setScanState("error");
      setErrorMessage("Kameraga ruxsat berilmadi yoki kamera topilmadi");
    }
  }, [handleScan, stopScanner]);

  useEffect(() => {
    if (open) {
      // Kichik kechikish — dialog DOM ga mount bo'lishi uchun
      const timeout = setTimeout(() => startScanner(), 300);
      return () => clearTimeout(timeout);
    } else {
      stopScanner();
      setScanState("scanning");
      setResult(null);
      setErrorMessage("");
      processingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = () => {
    startScanner();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lumio sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>QR Davomat</DialogTitle>
          <DialogDescription>
            O&apos;qituvchi ko&apos;rsatgan QR kodni skanerlang
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-2">
          {scanState === "scanning" || scanState === "loading" ? (
            <div className="w-full space-y-3">
              <div className="relative overflow-hidden rounded-feature border-4 border-coral-500/25 bg-black">
                <div
                  id="qr-dialog-reader"
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
                <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-amber-500/10 p-3 text-center">
                  <Camera size={32} weight="bold" className="text-amber-600" />
                  <span className="text-sm font-semibold text-ink-700">
                    Kameraga ruxsat bering va qayta urinib ko&apos;ring
                  </span>
                </div>
              )}
            </div>
          ) : scanState === "success" ? (
            <div className="w-full space-y-4 text-center">
              <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/12 text-success">
                <CheckCircle size={36} weight="fill" />
              </span>
              <div className="space-y-1.5">
                <h2 className="font-display text-lg font-extrabold text-success">
                  {result?.alreadyMarked
                    ? "Davomat allaqachon belgilangan"
                    : "Davomat belgilandi!"}
                </h2>
                {result?.groupName && (
                  <p className="text-sm font-semibold text-ink-500">
                    {result.groupName}
                  </p>
                )}
                {result?.lessonNumber && (
                  <p className="font-display text-lg font-bold text-coral-600">
                    {result.lessonNumber}-dars
                  </p>
                )}
              </div>
            </div>
          ) : scanState === "error" ? (
            <div className="w-full space-y-4 text-center">
              <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-danger/12 text-danger">
                <XCircle size={36} weight="fill" />
              </span>
              <div className="space-y-1.5">
                <h2 className="font-display text-lg font-extrabold text-danger">
                  Xatolik
                </h2>
                <p className="text-sm font-semibold text-ink-500">{errorMessage}</p>
              </div>
              <Button
                variant="secondary"
                onClick={handleRetry}
                iconBefore={<ArrowClockwise size={18} weight="bold" />}
              >
                Qayta urinish
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

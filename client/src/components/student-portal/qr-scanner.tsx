"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  XCircle,
  ArrowClockwise,
  Camera,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { Screen, StackHeader, Card, Button } from "./lumio";

type ScanState = "scanning" | "loading" | "success" | "error";

interface ScanResult {
  message: string;
  status?: string;
  alreadyMarked?: boolean;
  groupName?: string;
  lessonNumber?: number;
}

export function QrScanner() {
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [cameraError, setCameraError] = useState(false);

  const scannerRef = useRef<any>(null);
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

        // Balance gate: student not marked PRESENT — admin must collect payment.
        if (data?.balanceInsufficient) {
          const debt = data.debtAmount
            ? ` (${data.debtAmount.toLocaleString("uz-UZ").replace(/,/g, " ")} so'm yetishmaydi)`
            : "";
          setErrorMessage(
            (data.message ?? "Balansingiz dars uchun yetmadi") + debt,
          );
          setScanState("error");
          await stopScanner();
          try {
            navigator.vibrate?.([100, 50, 100]);
          } catch {
            // not supported
          }
          return;
        }

        setResult(data);
        setScanState("success");
        await stopScanner();
        try {
          navigator.vibrate?.(200);
        } catch {
          // not supported
        }
      } catch (err) {
        setErrorMessage(
          getErrorMessage(err, "QR kodni o'qishda xatolik yuz berdi"),
        );
        setScanState("error");
        await stopScanner();
        try {
          navigator.vibrate?.([100, 50, 100]);
        } catch {
          // not supported
        }
      }
    },
    [stopScanner],
  );

  const startScanner = useCallback(async () => {
    processingRef.current = false;
    setScanState("scanning");
    setResult(null);
    setErrorMessage("");
    setCameraError(false);

    const { Html5Qrcode } = await import("html5-qrcode");
    await stopScanner();

    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (decodedText) => handleScan(decodedText),
        () => {
          // QR not found — ignore
        },
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

  return (
    <Screen>
      <StackHeader title="QR Davomat" backHref="/portal" />

      <div className="mx-auto w-full max-w-sm">
        {scanState === "scanning" || scanState === "loading" ? (
          <div className="space-y-4">
            <p className="text-center text-sm font-semibold text-ink-500">
              {scanState === "loading"
                ? "Tekshirilmoqda..."
                : "O'qituvchi ko'rsatgan QR kodni skanerlang"}
            </p>
            <div className="relative overflow-hidden rounded-feature border-4 border-coral-500/25 bg-black">
              <div
                id="qr-reader"
                className={cn("w-full", scanState === "loading" && "opacity-50")}
              />
              {scanState === "loading" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
                </div>
              ) : null}
            </div>
            {cameraError ? (
              <Card className="flex flex-col items-center gap-2 text-center">
                <Camera size={32} weight="bold" className="text-amber-600" />
                <p className="text-sm font-semibold text-ink-700">
                  Kameraga ruxsat bering va qayta urinib ko&apos;ring
                </p>
              </Card>
            ) : null}
          </div>
        ) : scanState === "success" ? (
          <Card clay tone="neutral" className="space-y-5 py-8 text-center">
            <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-success/12 text-success">
              <CheckCircle size={44} weight="fill" />
            </span>
            <div className="space-y-1.5">
              <h2 className="font-display text-xl font-extrabold text-success">
                {result?.alreadyMarked
                  ? "Davomat allaqachon belgilangan"
                  : "Davomat belgilandi!"}
              </h2>
              {result?.groupName ? (
                <p className="text-sm font-semibold text-ink-500">
                  {result.groupName}
                </p>
              ) : null}
              {result?.lessonNumber ? (
                <p className="font-display text-lg font-bold text-coral-600">
                  {result.lessonNumber}-dars
                </p>
              ) : null}
            </div>
          </Card>
        ) : (
          <Card clay tone="neutral" className="space-y-5 py-8 text-center">
            <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-danger/12 text-danger">
              <XCircle size={44} weight="fill" />
            </span>
            <div className="space-y-1.5">
              <h2 className="font-display text-xl font-extrabold text-danger">
                Xatolik
              </h2>
              <p className="text-sm font-semibold text-ink-500">{errorMessage}</p>
            </div>
            <Button
              variant="secondary"
              onClick={startScanner}
              iconBefore={<ArrowClockwise size={18} weight="bold" />}
            >
              Qayta urinish
            </Button>
          </Card>
        )}
      </div>
    </Screen>
  );
}

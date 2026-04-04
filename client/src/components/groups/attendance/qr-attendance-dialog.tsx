"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, UserCheck, Volume2, VolumeX } from "lucide-react";
import toast from "react-hot-toast";
import Cookies from "js-cookie";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

interface ScannedStudent {
  studentId: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  scannedAt: string;
}

interface QrAttendanceDialogProps {
  groupId: string;
  groupName: string;
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}

export function QrAttendanceDialog({
  groupId,
  groupName,
  date,
  open,
  onOpenChange,
  onClose,
}: QrAttendanceDialogProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(45);
  const [totalStudents, setTotalStudents] = useState(0);
  const [scannedStudents, setScannedStudents] = useState<ScannedStudent[]>([]);
  const [starting, setStarting] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Sessiya boshlash
  const startSession = useCallback(async () => {
    setStarting(true);
    try {
      const { data } = await api.post(
        `/attendance/${groupId}/qr-session/start`,
        { date }
      );
      setSessionId(data.sessionId);
      sessionIdRef.current = data.sessionId;
      setToken(data.token);
      setCountdown(data.expiresIn);
      setTotalStudents(data.totalStudents);
      setScannedStudents([]);
    } catch (err) {
      const raw = (err as any)?.response?.data?.message;
      toast.error(Array.isArray(raw) ? raw[0] : (raw || "QR sessiya boshlashda xatolik"));
      onOpenChange(false);
    } finally {
      setStarting(false);
    }
  }, [groupId, date, onOpenChange]);

  // Token yangilash
  const rotateToken = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      const { data } = await api.post(
        `/attendance/${groupId}/qr-session/rotate`,
        { sessionId: sessionIdRef.current, date }
      );
      setToken(data.token);
      setCountdown(data.expiresIn);
    } catch {
      // Sessiya tugagan bo'lishi mumkin — xato ko'rsatmaymiz
    }
  }, [groupId, date]);

  // Sessiya to'xtatish
  const stopSession = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      await api.post(`/attendance/${groupId}/qr-session/stop`, {
        sessionId: sessionIdRef.current,
        date,
      });
    } catch {
      // Ignore stop errors
    }
    setSessionId(null);
    sessionIdRef.current = null;
    setToken(null);
  }, [groupId, date]);

  // Ovoz chiqarish (teacher uchun "ding")
  const playDing = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.value = 0.3;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio not supported
    }
  }, [soundEnabled]);

  // Dialog ochilganda sessiya boshlash
  useEffect(() => {
    if (open) {
      startSession();
    }
    return () => {
      // Dialog yopilganda tozalash
      if (countdownRef.current) clearInterval(countdownRef.current);
      sseAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (!token) return;

    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(45);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          rotateToken();
          return 45;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [token, rotateToken]);

  // SSE — real-time o'quvchi kelishi
  useEffect(() => {
    if (!open || !sessionId) return;

    const controller = new AbortController();
    sseAbortRef.current = controller;

    async function listenSSE() {
      const jwtToken = Cookies.get("token");
      if (!jwtToken) return;

      try {
        const response = await fetch(`${API_URL}/notifications/stream`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const payload = JSON.parse(line.slice(6));
                if (
                  payload.type === "qr-attendance" &&
                  payload.groupId === groupId &&
                  payload.date === date
                ) {
                  setScannedStudents((prev) => {
                    // Dublikat oldini olish
                    if (prev.some((s) => s.studentId === payload.studentId)) {
                      return prev;
                    }
                    return [
                      ...prev,
                      {
                        studentId: payload.studentId,
                        firstName: payload.student.firstName,
                        lastName: payload.student.lastName,
                        photo: payload.student.photo,
                        scannedAt: payload.scannedAt,
                      },
                    ];
                  });
                  playDing();
                }
              } catch {
                // ignore
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }

    listenSSE();

    return () => {
      controller.abort();
    };
  }, [open, sessionId, groupId, date, playDing]);

  // Dialog yopilganda sessiyani to'xtatish
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      stopSession();
      onClose();
    }
    onOpenChange(isOpen);
  };

  const countdownPercent = (countdown / 45) * 100;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>QR davomat — {groupName}</DialogTitle>
          <DialogDescription>
            O&apos;quvchilar ushbu QR kodni skanerlash orqali davomatga
            belgilanadi
          </DialogDescription>
        </DialogHeader>

        {starting ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : token ? (
          <div className="space-y-4">
            {/* QR kod */}
            <div className="flex justify-center">
              <div className="rounded-xl border-2 bg-white p-4">
                <QRCodeSVG
                  value={JSON.stringify({ t: token, v: 1 })}
                  size={220}
                  level="M"
                />
              </div>
            </div>

            {/* Timer */}
            <div className="flex items-center justify-center gap-3">
              <div className="relative h-2 w-full max-w-48 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full transition-all duration-1000",
                    countdown > 15
                      ? "bg-primary"
                      : countdown > 5
                        ? "bg-amber-500"
                        : "bg-red-500"
                  )}
                  style={{ width: `${countdownPercent}%` }}
                />
              </div>
              <span
                className={cn(
                  "min-w-10 text-center text-sm font-medium",
                  countdown <= 5 && "text-red-500"
                )}
              >
                {countdown}s
              </span>
            </div>

            {/* Ovoz tugmasi */}
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="text-muted-foreground"
              >
                {soundEnabled ? (
                  <Volume2 className="mr-1.5 size-4" />
                ) : (
                  <VolumeX className="mr-1.5 size-4" />
                )}
                {soundEnabled ? "Ovoz yoqilgan" : "Ovoz o'chirilgan"}
              </Button>
            </div>

            {/* Kelgan o'quvchilar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Kelgan o&apos;quvchilar</span>
                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                  <UserCheck className="size-3.5" />
                  {scannedStudents.length}/{totalStudents}
                </span>
              </div>

              {scannedStudents.length === 0 ? (
                <div className="flex h-16 items-center justify-center rounded-lg border border-dashed">
                  <p className="text-xs text-muted-foreground">
                    Hali hech kim skanerlagan emas
                  </p>
                </div>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {scannedStudents.map((student, i) => (
                    <div
                      key={student.studentId}
                      className="flex items-center gap-2.5 rounded-lg border border-green-200 bg-green-50/50 px-3 py-2 dark:border-green-800/50 dark:bg-green-950/20"
                    >
                      <span className="w-5 text-center text-xs text-muted-foreground">
                        {i + 1}
                      </span>
                      <Avatar className="size-7">
                        <AvatarImage src={student.photo ?? undefined} />
                        <AvatarFallback className="text-[10px]">
                          {student.firstName[0]}
                          {student.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate text-sm">
                        {student.firstName} {student.lastName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(student.scannedAt).toLocaleTimeString(
                          "uz-UZ",
                          { hour: "2-digit", minute: "2-digit", second: "2-digit" }
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

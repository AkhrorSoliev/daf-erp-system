"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";

// Telegram → API callback → portal. Bu sahifa faqat bir martalik `handoff`
// kodini tokenlarga almashtiradi: tokenlar URL'da hech qachon yurmaydi.
function TelegramCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuth();
  // Server tomon xatosi (`?error=`) va `handoff` yo'qligi darhol aniqlanadi —
  // lazy initializer'da hisoblanadi, shu bilan effekt ichida sinxron setState
  // chaqirilmaydi (cascading-render lint qoidasi).
  //
  // `?error=` — API callback'i `state` iste'mol qilingandan keyin xatoga
  // uchrasa, foydalanuvchini API domenida xom JSON bilan qoldirmasdan shu
  // sahifaga o'qiladigan xabar bilan qaytaradi.
  const [error, setError] = useState(() => {
    const fromServer = searchParams.get("error");
    if (fromServer) return fromServer;
    return searchParams.get("handoff")
      ? ""
      : "Kirish ma'lumoti topilmadi. Qaytadan urinib ko'ring.";
  });
  // Strict Mode ikki marta chaqiradi, handoff esa bir martalik — qulflaymiz.
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    const handoff = searchParams.get("handoff");
    if (!handoff) return;

    api
      .post("/auth/telegram/complete", { handoff })
      .then((res) => {
        setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
        const isStudent = res.data.user?.roles?.some(
          (r: { id: number }) => r.id === 6,
        );
        router.replace(isStudent ? "/portal" : "/");
      })
      .catch((err) => {
        setError(getErrorMessage(err, "Kirishni tugatib bo'lmadi"));
      });
  }, [searchParams, setAuth, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="text-sm text-primary hover:underline"
            >
              Kirish sahifasiga qaytish
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Kirish tasdiqlanmoqda...</p>
        )}
      </div>
    </div>
  );
}

export default function TelegramCallbackPage() {
  // `useSearchParams` Suspense chegarasini talab qiladi (statik prerender).
  return (
    <Suspense fallback={null}>
      <TelegramCallbackInner />
    </Suspense>
  );
}

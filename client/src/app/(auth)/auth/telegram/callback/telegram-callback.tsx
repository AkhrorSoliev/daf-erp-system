"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { Greeting, useGreeting } from "@/components/auth/staff-greeting";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";

// Our own fallback texts: kept in state as written and translated when drawn,
// so the sign-in effect does not depend on `t`. A message the server sent is
// shown as it came.
const NO_HANDOFF = msg("Kirish ma'lumoti topilmadi. Qaytadan urinib ko'ring.");
const FINISH_FAILED = msg("Kirishni tugatib bo'lmadi");

// Telegram → API callback → portal. Bu sahifa faqat bir martalik `handoff`
// kodini tokenlarga almashtiradi: tokenlar URL'da hech qachon yurmaydi.
// Qobiq (o'quvchida markazlashgan sahifa, xodimda `StaffSignInShell`) page.tsx da.
//
// `staff` — xodim xostida: kirish salomlashuv bilan tugaydi.
export function TelegramCallback({ staff = false }: { staff?: boolean }) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuth();
  // On a staff host the sign-in ends with the greeting, as on the form.
  const { greeted, greet } = useGreeting("replace");
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
    return searchParams.get("handoff") ? "" : NO_HANDOFF;
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
        const destination = isStudent ? "/portal" : "/";
        if (staff) greet(res.data.user, destination);
        else router.replace(destination);
      })
      .catch((err) => {
        setError(getErrorMessage(err, FINISH_FAILED));
      });
  }, [searchParams, setAuth, router, staff, greet]);

  if (greeted) return <Greeting user={greeted} />;

  const shownError =
    error === NO_HANDOFF
      ? t(NO_HANDOFF)
      : error === FINISH_FAILED
        ? t(FINISH_FAILED)
        : error;

  return (
    <div className={staff ? "flex flex-col items-start gap-3" : "space-y-4"}>
      {error ? (
        <>
          <p role="alert" className="text-sm text-destructive">
            {shownError}
          </p>
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="text-sm text-primary hover:underline"
          >
            {t("Kirish sahifasiga qaytish")}
          </button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("Kirish tasdiqlanmoqda...")}
        </p>
      )}
    </div>
  );
}

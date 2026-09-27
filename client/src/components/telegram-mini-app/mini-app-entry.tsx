"use client";

import { useRef, useState, type ReactNode } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { Button, Card } from "@/components/student-portal/lumio";
import {
  ArrowClockwise,
  CaretRight,
  CircleNotch,
  SignIn,
  SignOut,
  TelegramLogo,
  User,
  WarningCircle,
  X,
} from "@/components/student-portal/lumio/icon";
import {
  TELEGRAM_WEB_APP_SCRIPT,
  bouncedAfterSignIn,
  clearMiniAppSignedIn,
  closeMiniApp,
  getTelegramWebApp,
  markMiniAppSession,
  markMiniAppSignedIn,
  markMiniAppSignedOut,
  wasSignedOutInMiniApp,
  type MiniAppSignInResult,
  type MiniAppStudent,
} from "@/lib/telegram-mini-app";

type View =
  | { kind: "loading" }
  | { kind: "outside" }
  | { kind: "signed_out" }
  | { kind: "choose"; students: MiniAppStudent[] }
  | { kind: "not_registered" }
  | { kind: "error"; message: string; retry: () => void };

const SIGN_IN_FAILED =
  "Kirib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.";

/** Kirish muvaffaqiyatli bo'ldi, lekin portal uni ko'rmadi (`bouncedAfterSignIn`). */
const SESSION_NOT_KEPT =
  "Kirish bu oynada saqlanmadi. Telegram'ning brauzer versiyasida shunday bo'lishi mumkin — kabinetni telefon yoki kompyuterdagi Telegram ilovasidan oching.";

/**
 * Telegram Mini App'ning kirish nuqtasi (ADR-0040).
 *
 * Telegram akkaunti o'quvchiga bog'langan bo'lsa — avtomatik kiradi (parolsiz),
 * bog'lanmagan bo'lsa — xabar. Telefon/parol formasi bu yerda yo'q: Mini App
 * ichida kirish faqat Telegram orqali.
 */
export function MiniAppEntry() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const clearSession = useAuth((s) => s.clearSession);
  const [view, setView] = useState<View>({ kind: "loading" });
  const initData = useRef("");
  // `onReady` har mount'da chaqiriladi (Strict Mode'da ikki marta) — bitta
  // ochilish bitta so'rov bo'lsin.
  const started = useRef(false);

  async function signIn(studentId?: number) {
    setView({ kind: "loading" });
    try {
      const { data } = await api.post<MiniAppSignInResult>(
        "/auth/telegram/webapp",
        studentId === undefined
          ? { initData: initData.current }
          : { initData: initData.current, studentId },
      );
      if (data.status === "authenticated") {
        markMiniAppSignedOut(false);
        markMiniAppSignedIn();
        setAuth(data.user, data.accessToken, data.refreshToken);
        router.replace("/portal");
      } else if (data.status === "choose") {
        setView({ kind: "choose", students: data.students });
      } else {
        setView({ kind: "not_registered" });
      }
    } catch (err) {
      setView({
        kind: "error",
        message: getErrorMessage(err, SIGN_IN_FAILED),
        retry: () => void signIn(studentId),
      });
    }
  }

  function start() {
    if (started.current) return;
    started.current = true;

    const webApp = getTelegramWebApp();
    if (!webApp?.initData) {
      setView({ kind: "outside" });
      return;
    }
    webApp.ready();
    webApp.expand();
    try {
      // Pastga surilganda Mini App yopilib qolmasin — sahifalar aylantiriladi.
      webApp.disableVerticalSwipes?.();
    } catch {
      // Eski klient: standart xatti-harakat qoladi.
    }

    initData.current = webApp.initData;
    markMiniAppSession();
    // Kirish har doim sessiyasiz boshlanadi: shu WebView'da boshqa Telegram
    // akkaunt qoldirgan sessiya bu akkauntga o'tib ketmasin.
    clearSession();

    if (wasSignedOutInMiniApp()) {
      setView({ kind: "signed_out" });
      return;
    }
    if (bouncedAfterSignIn()) {
      // Hozirgina kirgan edik, portal esa bizni qaytardi — yana kirsak
      // cheksiz aylanardi. Qayta urinish faqat tugma bilan.
      clearMiniAppSignedIn();
      setView({
        kind: "error",
        message: SESSION_NOT_KEPT,
        retry: () => void signIn(),
      });
      return;
    }
    void signIn();
  }

  return (
    <>
      <Script
        src={TELEGRAM_WEB_APP_SCRIPT}
        strategy="afterInteractive"
        onReady={start}
        onError={() =>
          setView({
            kind: "error",
            message: SIGN_IN_FAILED,
            retry: () => window.location.reload(),
          })
        }
      />
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <MiniAppView
            view={view}
            onSignIn={(studentId) => void signIn(studentId)}
            onReenter={() => {
              markMiniAppSignedOut(false);
              void signIn();
            }}
            onOpenLogin={() => router.replace("/login")}
          />
        </div>
      </main>
    </>
  );
}

function MiniAppView({
  view,
  onSignIn,
  onReenter,
  onOpenLogin,
}: {
  view: View;
  onSignIn: (studentId: number) => void;
  onReenter: () => void;
  onOpenLogin: () => void;
}) {
  switch (view.kind) {
    case "loading":
      return (
        <div className="flex flex-col items-center gap-3 text-ink-500">
          <CircleNotch className="size-8 animate-spin" weight="bold" />
          <p className="text-sm font-semibold">Kabinet ochilmoqda…</p>
        </div>
      );

    case "outside":
      return (
        <Notice
          icon={<TelegramLogo weight="fill" />}
          title="Bu sahifa Telegram ichida ochiladi"
          description="Kabinetni Telegram botidagi «Kabinet» tugmasi orqali oching yoki telefon raqam va parol bilan kiring."
        >
          <Button block onClick={onOpenLogin}>
            Kirish sahifasi
          </Button>
        </Notice>
      );

    case "signed_out":
      return (
        <Notice
          icon={<SignOut weight="bold" />}
          title="Hisobdan chiqdingiz"
          description="Kabinetga qayta kirish uchun tugmani bosing — parol kerak emas."
        >
          <Button
            block
            iconBefore={<SignIn weight="bold" />}
            onClick={onReenter}
          >
            Qayta kirish
          </Button>
          <CloseButton />
        </Notice>
      );

    case "choose":
      return (
        <Notice
          icon={<User weight="bold" />}
          title="Kim kiradi?"
          description="Bu Telegram akkauntga bir nechta o'quvchi bog'langan. Kabinetini ochmoqchi bo'lgan o'quvchini tanlang."
        >
          <div className="space-y-2">
            {view.students.map((student) => (
              <Button
                key={student.id}
                block
                variant="secondary"
                className="justify-between"
                iconAfter={<CaretRight weight="bold" />}
                onClick={() => onSignIn(student.id)}
              >
                {`${student.firstName} ${student.lastName}`.trim()}
              </Button>
            ))}
          </div>
        </Notice>
      );

    case "not_registered":
      return (
        <Notice
          icon={<WarningCircle weight="bold" />}
          title="Telegram akkauntingiz ro'yxatdan o'tmagan"
          description="Bu Telegram akkaunt hech bir DaF o'quvchisiga bog'lanmagan."
        >
          {/* Admin panelida Telegram'ni bog'lash yo'q — bog'lash faqat botda,
              odam o'z raqamini tasdiqlagandan keyin. «To'lovlar» buni boshqa
              hech narsaga tegmasdan qiladi (parol tiklash esa parolni ham
              almashtiradi). */}
          <Card
            pad="md"
            className="space-y-2 text-left text-sm font-semibold text-ink-700"
          >
            <p>
              DaF o'quvchisi bo'lsangiz: botga qayting, «💳 To'lovlar» tugmasini
              bosing va «📱 Telefon raqamni yuborish» orqali raqamingizni
              yuboring. Akkauntingiz bog'lanadi — so'ng kabinetni qayta oching.
            </p>
            <p className="text-ink-500">
              Raqamingiz tizimda topilmasa, administrator bilan bog'laning.
            </p>
          </Card>
          <Button
            block
            iconBefore={<TelegramLogo weight="fill" />}
            onClick={closeMiniApp}
          >
            Botga qaytish
          </Button>
        </Notice>
      );

    case "error":
      return (
        <Notice
          icon={<WarningCircle weight="bold" />}
          title="Kirib bo'lmadi"
          description={view.message}
        >
          <Button
            block
            iconBefore={<ArrowClockwise weight="bold" />}
            onClick={view.retry}
          >
            Qayta urinish
          </Button>
          <CloseButton />
        </Notice>
      );
  }
}

function Notice({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="mb-1 inline-flex size-16 items-center justify-center rounded-full bg-sunk text-3xl text-ink-400">
        {icon}
      </span>
      <h1 className="font-display text-xl font-extrabold text-ink-900">
        {title}
      </h1>
      <p className="text-sm font-semibold text-ink-500">{description}</p>
      <div className="mt-2 w-full space-y-3">{children}</div>
    </div>
  );
}

function CloseButton() {
  return (
    <Button
      block
      variant="ghost"
      iconBefore={<X weight="bold" />}
      onClick={closeMiniApp}
    >
      Yopish
    </Button>
  );
}

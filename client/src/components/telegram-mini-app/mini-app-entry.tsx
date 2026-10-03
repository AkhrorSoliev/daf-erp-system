"use client";

import { useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { Greeting, useGreeting } from "@/components/auth/daftar-greeting";
import {
  ArrowClockwise,
  CaretRight,
  SignIn,
  SignOut,
  TelegramLogo,
  User,
  WarningCircle,
} from "@/components/student-portal/lumio/icon";
import {
  TELEGRAM_WEB_APP_SCRIPT,
  bouncedAfterSignIn,
  clearMiniAppSignedIn,
  getTelegramWebApp,
  markMiniAppSession,
  markMiniAppSignedIn,
  markMiniAppSignedOut,
  miniAppAudienceForHost,
  staffCabinetPath,
  wasSignedOutInMiniApp,
  type MiniAppAudience,
  type MiniAppSignInResult,
  type MiniAppStaffSignInResult,
  type MiniAppStudent,
} from "@/lib/telegram-mini-app";
import {
  Action,
  CloseButton,
  DaftarSkin,
  Loading,
  Notice,
  NotRegisteredNotice,
  StaffAccountNotice,
} from "./mini-app-notices";

type View =
  | { kind: "loading" }
  | { kind: "outside" }
  | { kind: "signed_out" }
  | { kind: "choose"; students: MiniAppStudent[] }
  | { kind: "not_registered"; audience: MiniAppAudience }
  /** O'quvchi kabinetini xodim ochdi (ADR-0045). */
  | { kind: "staff_account" }
  | { kind: "error"; message: string; retry: () => void };

type Session = Extract<MiniAppSignInResult, { status: "authenticated" }>;

const SIGN_IN_FAILED =
  "Kirib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.";

/** Kirish muvaffaqiyatli bo'ldi, lekin portal uni ko'rmadi (`bouncedAfterSignIn`). */
const SESSION_NOT_KEPT =
  "Kirish bu oynada saqlanmadi. Telegram'ning brauzer versiyasida shunday bo'lishi mumkin — kabinetni telefon yoki kompyuterdagi Telegram ilovasidan oching.";

/**
 * Telegram Mini App'ning kirish nuqtasi: `student.` xostida o'quvchi kabineti
 * (ADR-0040), `lehrer.` va `admin.` xostlarida xodim kabineti (ADR-0045).
 *
 * Telegram akkaunti kabinet egasiga bog'langan bo'lsa — avtomatik kiradi
 * (parolsiz), bog'lanmagan bo'lsa — xabar. Telefon/parol formasi bu yerda yo'q:
 * Mini App ichida kirish faqat Telegram orqali.
 *
 * `daftar` — the page has put this on the Daftar sheet (the staff hosts): the
 * same states are then drawn in the sheet's look, and the sheet is the frame.
 * It changes nothing about who is signed in or how.
 */
export function MiniAppEntry({ daftar = false }: { daftar?: boolean }) {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const clearSession = useAuth((s) => s.clearSession);
  const [view, setView] = useState<View>({ kind: "loading" });
  // On the staff sheet a sign-in ends with the greeting of the sign-in pages.
  const { greeted, greet } = useGreeting("replace");
  const initData = useRef("");
  // Xost va `?next=` `start()` da o'qiladi — server render'da `window` yo'q.
  const audience = useRef<MiniAppAudience>("student");
  const nextPage = useRef<string | null>(null);
  // `onReady` har mount'da chaqiriladi (Strict Mode'da ikki marta) — bitta
  // ochilish bitta so'rov bo'lsin.
  const started = useRef(false);

  function enter(session: Session, path: string) {
    markMiniAppSignedOut(false);
    markMiniAppSignedIn();
    setAuth(session.user, session.accessToken, session.refreshToken);
    if (daftar) greet(session.user, path);
    else router.replace(path);
  }

  async function signInStudent(studentId?: number) {
    const { data } = await api.post<MiniAppSignInResult>(
      "/auth/telegram/webapp",
      studentId === undefined
        ? { initData: initData.current }
        : { initData: initData.current, studentId },
    );
    if (data.status === "authenticated") enter(data, "/portal");
    else if (data.status === "choose") {
      setView({ kind: "choose", students: data.students });
    } else if (data.status === "staff") setView({ kind: "staff_account" });
    else setView({ kind: "not_registered", audience: "student" });
  }

  async function signInStaff() {
    const { data } = await api.post<MiniAppStaffSignInResult>(
      "/auth/telegram/webapp/staff",
      { initData: initData.current },
    );
    if (data.status === "authenticated") {
      enter(data, staffCabinetPath(nextPage.current));
    } else {
      setView({ kind: "not_registered", audience: "staff" });
    }
  }

  async function signIn(studentId?: number) {
    setView({ kind: "loading" });
    try {
      if (audience.current === "staff") await signInStaff();
      else await signInStudent(studentId);
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
    audience.current = miniAppAudienceForHost(window.location.host);
    nextPage.current = new URLSearchParams(window.location.search).get("next");
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

  const state = (
    <MiniAppView
      view={view}
      onSignIn={(studentId) => void signIn(studentId)}
      onReenter={() => {
        markMiniAppSignedOut(false);
        void signIn();
      }}
      onOpenLogin={() => router.replace("/login")}
    />
  );

  return (
    <DaftarSkin value={daftar}>
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
      {daftar ? (
        greeted ? (
          <Greeting user={greeted} />
        ) : (
          state
        )
      ) : (
        <main className="flex min-h-screen items-center justify-center px-4 py-10">
          <div className="w-full max-w-sm">{state}</div>
        </main>
      )}
    </DaftarSkin>
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
      return <Loading>Kabinet ochilmoqda…</Loading>;

    case "outside":
      return (
        <Notice
          icon={<TelegramLogo weight="fill" />}
          title="Bu sahifa Telegram ichida ochiladi"
          description="Kabinetni Telegram botidagi «Kabinet» tugmasi orqali oching yoki telefon raqam va parol bilan kiring."
        >
          <Action onClick={onOpenLogin}>Kirish sahifasi</Action>
        </Notice>
      );

    case "signed_out":
      return (
        <Notice
          icon={<SignOut weight="bold" />}
          title="Hisobdan chiqdingiz"
          description="Kabinetga qayta kirish uchun tugmani bosing — parol kerak emas."
        >
          <Action iconBefore={<SignIn weight="bold" />} onClick={onReenter}>
            Qayta kirish
          </Action>
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
              <Action
                key={student.id}
                variant="secondary"
                className="justify-between"
                iconAfter={<CaretRight weight="bold" />}
                onClick={() => onSignIn(student.id)}
              >
                {`${student.firstName} ${student.lastName}`.trim()}
              </Action>
            ))}
          </div>
        </Notice>
      );

    case "not_registered":
      return <NotRegisteredNotice audience={view.audience} />;

    case "staff_account":
      return <StaffAccountNotice />;

    case "error":
      return (
        <Notice
          alert
          icon={<WarningCircle weight="bold" />}
          title="Kirib bo'lmadi"
          description={view.message}
        >
          <Action
            iconBefore={<ArrowClockwise weight="bold" />}
            onClick={view.retry}
          >
            Qayta urinish
          </Action>
          <CloseButton />
        </Notice>
      );
  }
}

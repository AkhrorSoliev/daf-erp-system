"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import { Books, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { Button, EmptyState, LoadingCards, ProgressBar } from "../../lumio";
import { LernenLessonPage } from "../lernen-lesson-page";
import { useAbschluss, useErsatz, useLernenLesson, usePruefen, useUebungSeans } from "../queries";
import type { PruefErgebnis } from "../types";
import {
  boshla,
  ersatzKeldi,
  javobBerildi,
  joriy,
  tugadimi,
  type SeansHolati,
} from "../seans-navbat";
import { harakat, koersatma } from "./koersatma";
import { Tanlash } from "./tanlash";
import { Yozish } from "./yozish";
import { Yigish } from "./yigish";
import { NatijaEkrani } from "./natija-ekrani";

export interface SeansEkraniProps {
  lessonId: number;
}

/**
 * Bitta dars uchun to'liq mashq seansi: bitta savol butun ekranda,
 * tepada ilgarilash, pastda bitta katta tugma, oxirida natija ekrani.
 *
 * Barcha ketma-ketlik qarorlari (nechta savol qoldi, qaytish kerakmi,
 * ball) `seans-navbat.ts` da. Bu komponent faqat o'sha holatni o'qiydi
 * va uning funksiyalarini chaqiradi — bu yerda hech qanday sanash yoki
 * hisoblash YO'Q.
 */
export function SeansEkrani({ lessonId }: SeansEkraniProps) {
  const router = useRouter();
  const seans = useUebungSeans(lessonId);
  const lesson = useLernenLesson(lessonId);
  const pruefen = usePruefen();
  const ersatzSorov = useErsatz();
  const abschluss = useAbschluss();

  const unitId = lesson.data?.unit.id ?? null;
  const chiqishHref = unitId ? `/portal/lernen/units/${unitId}` : "/portal/lernen";

  const [holat, setHolat] = React.useState<SeansHolati | null>(null);
  const [tanlangan, setTanlangan] = React.useState<string | null>(null);
  const [yozilgan, setYozilgan] = React.useState("");
  const [yigilgan, setYigilgan] = React.useState<string[]>([]);
  const [natija, setNatija] = React.useState<PruefErgebnis | null>(null);
  const [savolBoshi, setSavolBoshi] = React.useState(() => Date.now());
  const [seansBoshi, setSeansBoshi] = React.useState(() => Date.now());

  // Seans faqat serverdan savollar kelganda BIR MARTA boshlanadi — har
  // qayta chizilishda `boshla` chaqirilsa, o'quvchining joriy o'rni
  // yo'qolib, seans qaytadan boshidan tushardi.
  const boshlandiMi = React.useRef(false);
  React.useEffect(() => {
    if (boshlandiMi.current) return;
    if (!seans.data || seans.data.length === 0) return;
    boshlandiMi.current = true;
    setHolat(boshla(seans.data));
  }, [seans.data]);

  const frage = holat ? joriy(holat) : null;
  const rejim = frage ? harakat(frage.format) : null;

  const given =
    rejim === "TANLASH"
      ? (tanlangan ?? "")
      : rejim === "YOZISH"
        ? yozilgan.trim()
        : frage?.format === "SATZ_BAUEN"
          ? yigilgan.join(" ")
          : yigilgan.join("|"); // PAAR: `de=uz|de=uz|…`

  const tayyor =
    rejim === "TANLASH"
      ? tanlangan != null
      : rejim === "YOZISH"
        ? yozilgan.trim().length > 0
        : frage?.format === "PAAR"
          ? yigilgan.length === 4
          : yigilgan.length > 0;

  const tekshir = () => {
    if (!frage || !tayyor || natija || pruefen.isPending) return;
    pruefen.mutate(
      {
        itemType: frage.itemType,
        itemId: frage.itemId,
        format: frage.format,
        given,
        durationMs: Date.now() - savolBoshi,
      },
      { onSuccess: setNatija },
    );
  };

  const keyingi = async () => {
    if (!holat || !frage || !natija) return;
    const { holat: yangi, ersatzSoralsinmi } = javobBerildi(holat, natija);

    let keyingiHolat = yangi;
    if (ersatzSoralsinmi) {
      // So'rov yiqilsa `null` deb qaraladi: savol tugatilgan hisoblanadi
      // va seans tugaydi. Aks holda `tugatilgan` hech qachon `jami` ga
      // yetmay, o'quvchi natija ekranini ko'rmay qolardi.
      const ersatz = await ersatzSorov
        .mutateAsync({
          lessonId,
          itemType: frage.itemType,
          itemId: frage.itemId,
          nichtFormat: frage.format,
        })
        .catch(() => null);
      keyingiHolat = ersatzKeldi(yangi, ersatz);
    }

    setHolat(keyingiHolat);
    setNatija(null);
    setTanlangan(null);
    setYozilgan("");
    setYigilgan([]);
    setSavolBoshi(Date.now());
  };

  // Seans tugaganda `abschluss` FAQAT bir marta yuboriladi. Ref bilan
  // qo'riqlanadi, holat bilan emas — holat qayta chizilishda o'zgarmaydi
  // (`holat` obyekti allaqachon "tugagan"), lekin effekt baribir har
  // renderda ishga tushishi mumkin va `runs` bir necha marta oshib
  // ketardi.
  const yozildi = React.useRef(false);
  // Tugagan lahzadagi davomiylik shu yerda "muzlatiladi" — aks holda
  // `abschluss.mutate` o'zi keltirgan qayta chizilish (pending → success)
  // natija ekranidagi vaqtni har safar biroz oshirib ko'rsatardi.
  const tugashDavomiyligi = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!holat || !tugadimi(holat) || holat.jami === 0 || yozildi.current) return;
    yozildi.current = true;
    tugashDavomiyligi.current = Date.now() - seansBoshi;
    abschluss.mutate(
      {
        lessonId,
        richtig: holat.togri,
        gesamt: holat.jami,
        durationMs: tugashDavomiyligi.current,
      },
      {
        // `ersatz`ning jimligi ataylab — o'rinbosar savol topilmasligi
        // oddiy holat. Bu yerda esa yo'qotish HAQIQIY: ball yozilmasa,
        // o'quvchining ilgarilashi saqlanmay qoladi va buni ko'rsatish
        // shart — natija ekrani muvaffaqiyatning o'zi, shuning uchun
        // faqat xato holatida tost chiqadi.
        onError: (err) =>
          toast.error(getErrorMessage(err, "Natija saqlanmadi. Internetni tekshiring")),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holat]);

  // Qayta o'tishda seans YANGI so'rov bilan yangilanadi — Leitner
  // jadvali orqali qaytgan so'zlar birinchi safargidan farq qilishi
  // mumkin, shuning uchun eski `seans.data` emas, `refetch` natijasi
  // ishlatiladi.
  const qaytaOtish = async () => {
    const { data } = await seans.refetch();
    if (!data) return;
    yozildi.current = false;
    tugashDavomiyligi.current = null;
    setHolat(boshla(data));
    setNatija(null);
    setTanlangan(null);
    setYozilgan("");
    setYigilgan([]);
    setSavolBoshi(Date.now());
    setSeansBoshi(Date.now());
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Yozish rejimida raqamlar javobning O'ZI — ularni tortib
      // olsak, o'quvchi «7» yoza olmasdi.
      if (e.key === "Enter") {
        // Tekshirish bosqichida (`natija` hali yo'q) `Yozish` maydoni
        // Enter'ni O'ZI ushlaydi (`onEnter` orqali) va hodisa shu yerga
        // baribir ko'tarilib keladi (bubbling) — qayta ishlasak,
        // tekshirish IKKI marta yuborilardi. Ammo natija kelgach maydon
        // `disabled` bo'lib fokusni yo'qotadi, uning mahalliy ushlagichi
        // endi ishlamaydi — «Keyingi»ga o'tishni shu global ushlagich
        // olib qoladi, aks holda LUECKE'da Enter hech narsa qilmay qolardi.
        if (rejim === "YOZISH" && !natija) return;
        e.preventDefault();
        if (natija) void keyingi();
        else tekshir();
        return;
      }
      if (rejim !== "TANLASH" || natija) return;
      const n = Number(e.key);
      if (n >= 1 && n <= (frage?.options.length ?? 0)) {
        setTanlangan(frage!.options[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejim, natija, frage, tanlangan, given, tayyor]);

  if (seans.isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-4">
        <LoadingCards />
      </div>
    );
  }

  if (seans.isError) {
    const status = axios.isAxiosError(seans.error) ? seans.error.response?.status : null;
    if (status === 404) {
      return (
        <div className="mx-auto w-full max-w-2xl px-4 pt-10">
          <EmptyState
            icon={<Books size={28} weight="bold" />}
            title="Bu dars topilmadi"
            action={
              <Button variant="secondary" onClick={() => router.push("/portal/lernen")}>
                Orqaga
              </Button>
            }
          />
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-10">
        <EmptyState
          icon={<Books size={28} weight="bold" />}
          title="Mashqni ochib bo'lmadi"
          action={
            <Button variant="secondary" onClick={() => void seans.refetch()}>
              Qayta urinish
            </Button>
          }
        />
      </div>
    );
  }

  // Yangi dvigatel bu dars uchun savol qura olmadi (masalan eski DiB
  // darsi) — Faza 2 ning eski sahifasiga tushiladi, u lug'at + mavjud
  // mashqlarni ko'rsatadi.
  if (seans.data && seans.data.length === 0) {
    return <LernenLessonPage lessonId={lessonId} />;
  }

  // `holat` hali `boshla` bilan o'rnatilmagan (o'tish zumlik fon oralig'i).
  if (!holat) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-4">
        <LoadingCards />
      </div>
    );
  }

  // MUHIM: bu tekshiruv `!frage` dan OLDIN kelishi kerak. Oxirgi savol
  // javob berilganda `navbat` bo'shaydi va `joriy(holat)` `null`
  // qaytaradi — agar tartib teskari bo'lsa, natija ekrani hech qachon
  // ko'rinmay, o'quvchi abadiy yuklanish holatida qolib ketardi.
  if (tugadimi(holat)) {
    return (
      <NatijaEkrani
        togri={holat.togri}
        jami={holat.jami}
        durationMs={tugashDavomiyligi.current ?? Date.now() - seansBoshi}
        xatolar={holat.xatolar}
        unitId={unitId}
        onQayta={qaytaOtish}
      />
    );
  }

  if (!frage) {
    // `holat` bor va tugamagan — `joriy` har doim savol qaytarishi
    // kerak. Bu faqat TypeScript uchun himoya, amalda yetib bo'lmaydi.
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-4">
        <LoadingCards />
      </div>
    );
  }

  const yuborishXato = pruefen.isError;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-40 pt-4">
      {/* Tepa: chiqish, ilgarilash chizig'i, sanoq */}
      <header className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Seansdan chiqish"
          onClick={() => router.push(chiqishHref)}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-tint"
        >
          <X size={22} />
        </button>
        {/* Lumio `ProgressBar` FOIZ oladi (0–100), kasr emas — `value`ga
            `tugatilgan`ni bersak, 12 dan 4 chizig'ning 4 % ini bo'yardi. */}
        <ProgressBar
          value={holat.jami ? (holat.tugatilgan / holat.jami) * 100 : 0}
          className="flex-1"
        />
        <span className="text-sm font-bold tabular-nums text-ink-500">
          {holat.tugatilgan}/{holat.jami}
        </span>
      </header>

      {/* O'rta: ko'rsatma, savol, yordam, javob */}
      <main className="flex flex-1 flex-col justify-center gap-4 py-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-400">
          {koersatma(frage.format)}
        </p>
        <p className="text-2xl font-bold text-ink-900 sm:text-3xl">{frage.prompt}</p>
        {frage.hilfe ? <p className="text-sm text-ink-500">{frage.hilfe}</p> : null}

        {rejim === "TANLASH" ? (
          <Tanlash
            options={frage.options}
            tanlangan={tanlangan}
            onTanla={setTanlangan}
            natija={natija}
            kutilmoqda={pruefen.isPending}
          />
        ) : rejim === "YOZISH" ? (
          <Yozish
            qiymat={yozilgan}
            onYoz={setYozilgan}
            natija={natija}
            onEnter={() => (natija ? void keyingi() : tekshir())}
            kutilmoqda={pruefen.isPending}
          />
        ) : (
          <Yigish
            format={frage.format as "SATZ_BAUEN" | "PAAR"}
            options={frage.options}
            tanlangan={yigilgan}
            onOzgar={setYigilgan}
            natija={natija}
            kutilmoqda={pruefen.isPending}
          />
        )}
      </main>

      {/* Pastdagi yopishqoq panel — natija ham, tugma ham shu yerda. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto w-full max-w-2xl space-y-2.5">
          {natija ? (
            <div
              className={cn(
                "rounded-2xl px-4 py-3",
                natija.isCorrect ? "bg-success/10" : "bg-danger/10",
              )}
            >
              <p className={cn("font-bold", natija.isCorrect ? "text-success" : "text-danger")}>
                {natija.isCorrect ? "To'g'ri!" : "Xato"}
              </p>
              {!natija.isCorrect ? (
                <p className="mt-0.5 text-sm font-semibold text-ink-800">{natija.richtig}</p>
              ) : null}
            </div>
          ) : yuborishXato ? (
            <p className="text-sm font-semibold text-danger">
              Yuborib bo&apos;lmadi. Qayta urinib ko&apos;ring
            </p>
          ) : null}
          <Button
            className="w-full"
            onClick={natija ? () => void keyingi() : tekshir}
            disabled={natija ? false : !tayyor || pruefen.isPending}
          >
            {natija ? "Keyingi" : pruefen.isPending ? "Tekshirilmoqda…" : "Tekshirish"}
          </Button>
        </div>
      </div>
    </div>
  );
}

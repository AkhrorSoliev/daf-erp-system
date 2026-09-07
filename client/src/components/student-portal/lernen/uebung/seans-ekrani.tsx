"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import { Books, CheckCircle, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { Button, EmptyState, LoadingCards, ProgressBar } from "../../lumio";
import { LernenLessonPage } from "../lernen-lesson-page";
import {
  useAbschluss,
  useErsatz,
  useFortschritt,
  useJuftTekshir,
  useLernenLesson,
  usePruefen,
  useUebungSeans,
  useWiederholung,
} from "../queries";
import type { PruefErgebnis } from "../types";
import {
  boshla,
  ersatzKeldi,
  javobBerildi,
  joriy,
  tugadimi,
  type SeansHolati,
} from "../seans-navbat";
import {
  boshlaJuftlar,
  hammasiTogri,
  juftJavobKeldi,
  juftQoshildi,
  type JonliJuft,
} from "./juft-holati";
import { harakat, koersatma } from "./koersatma";
import { Tanlash } from "./tanlash";
import { Yozish } from "./yozish";
import { Yigish, juftSoni, juftUstunlar } from "./yigish";
import { DialogBlok } from "./dialog-blok";
import { NatijaEkrani } from "./natija-ekrani";
import {
  fortschrittSurati,
  keyingiBoshlangichSurati,
  type FortschrittSurati,
} from "./seans-boshlangich";

/**
 * `manba: "takrorlash"`da `lessonId` UMUMAN QABUL QILINMAYDI — takrorlash
 * hech qanday darsga tegishli emas (`abschluss` ham shu sabab yuborilmaydi,
 * pastga qarang).
 *
 * Ilgari bu ikkisi mustaqil ixtiyoriy maydon edi (`manba?: ...; lessonId?:
 * number`), va `<SeansEkrani manba="dars" />` (`lessonId`siz) tur
 * tekshiruvidan XATOSIZ o'tardi: ikkala so'rov ham abadiy `enabled: false`
 * qolib, ekran hech qachon xato bermay `<LoadingCards />`da abadiy osilib
 * qolardi — bo'sh ekrandan HAM YOMONI. Diskriminatsiya qilingan union bu
 * noto'g'ri kombinatsiyani TUR DARAJASIDA ifodalab bo'lmaydigan qiladi:
 * `lessonId` `"dars"`da MAJBURIY, `"takrorlash"`da esa umuman berilmaydi
 * (ortiqcha maydon sifatida rad etiladi).
 */
export type SeansEkraniProps =
  | { manba?: "dars"; lessonId: number }
  | { manba: "takrorlash" };

/**
 * Bitta dars UCHUN HAM, takrorlash UCHUN HAM ishlatiladigan to'liq mashq
 * seansi: bitta savol butun ekranda, tepada ilgarilash, pastda bitta
 * katta tugma, oxirida natija ekrani.
 *
 * Ikkalasining nusxasi OLINMAYDI — savol manbasi va oxirida
 * `abschluss` yuborilishi-yuborilmasligidan tashqari, ketma-ketlik,
 * ball va natija ekrani BITTA joyda qoladi. Barcha ketma-ketlik
 * qarorlari (nechta savol qoldi, qaytish kerakmi, ball) `seans-navbat.ts`
 * da. Bu komponent faqat o'sha holatni o'qiydi va uning funksiyalarini
 * chaqiradi — bu yerda hech qanday sanash yoki hisoblash YO'Q.
 */
export function SeansEkrani(props: SeansEkraniProps) {
  const router = useRouter();
  const qc = useQueryClient();

  // Diskriminatsiya BIR MARTA, shu yerda: `props.manba` to'g'ridan-to'g'ri
  // tekshirilgani uchun TypeScript shu ifodaning ikkala tarmog'ida `props`ni
  // to'g'ri toraytiradi — pastda `lessonId`ni yana ajratish yoki uni
  // "as number" bilan majburlashning hojati yo'q, faqat ushbu ikki
  // o'zgaruvchi ishlatiladi.
  const darsMi = props.manba !== "takrorlash";
  const lessonId = props.manba === "takrorlash" ? null : props.lessonId;
  // `darsMi` bo'lganda `lessonId` HAR DOIM `number` — yuqoridagi ikki
  // tayinlashning o'zi buni ta'minlaydi (union boshqa holatni bermaydi).
  // Pastda uni har safar qayta isbotlash yoki "as number" sepishning
  // o'rniga, shu BITTA joyda non-null qilib olinadi; faqat `darsMi`
  // aniqlangan joylarda ishlatiladi.
  const darsLessonId = lessonId as number;

  // Ikkala so'rov ham DOIM chaqiriladi (Hooks tartibi shart), faqat
  // `manba`ga mos kelmagani `enabled: false`/`NaN` bilan o'chiriladi.
  // `lessonId` faqat `!darsMi` bo'lganda `null` — `?? NaN` shu holatni
  // to'g'ridan-to'g'ri o'chirishga aylantiradi, qo'shimcha shart shart emas.
  const darsSeans = useUebungSeans(lessonId ?? NaN);
  const takrorlashSeans = useWiederholung(!darsMi);
  const seans = darsMi ? darsSeans : takrorlashSeans;

  const lesson = useLernenLesson(lessonId ?? NaN);
  const pruefen = usePruefen();
  const juftTekshir = useJuftTekshir();
  const ersatzSorov = useErsatz();
  const abschluss = useAbschluss();
  const fortschritt = useFortschritt();

  const unitId = darsMi ? (lesson.data?.unit.id ?? null) : null;
  const chiqishHref = unitId ? `/portal/lernen/units/${unitId}` : "/portal/lernen";

  const [holat, setHolat] = React.useState<SeansHolati | null>(null);
  const [tanlangan, setTanlangan] = React.useState<string | null>(null);
  const [yozilgan, setYozilgan] = React.useState("");
  const [yigilgan, setYigilgan] = React.useState<string[]>([]);
  // Jonli juftlash (`PAAR`/`ZUORDNEN`) holati — `Yigish`/`Juftlash`
  // buni faqat CHIZADI, hamma o'zgarish shu yerda sodir bo'ladi
  // (`onJuft`, pastda). `yigilgan` bu ikki format uchun ISHLATILMAYDI.
  const [juftlar, setJuftlar] = React.useState<JonliJuft[]>(boshlaJuftlar());
  // Endigina xato bo'lgan (shu sabab `juftlar`dan olib tashlangan)
  // juftlar — qisqa vaqt qizil ko'rsatish uchun (`Juftlash`ga
  // `xatoIdxlar` sifatida uzatiladi).
  const [xatoIdxlar, setXatoIdxlar] = React.useState<{ chapIdx: number; ongIdx: number }[]>([]);
  // Joriy savolda nechta juft BIRINCHI urinishda xato bo'lgani —
  // savol tugaganda sintetik `natija.isCorrect`ni hisoblash uchun
  // (pastga qarang, `juftHammasiTogriEffekt`). Holat emas, REF: bu
  // sanoq render'ni qayta chizishga sabab bo'lmasligi kerak — faqat
  // `hammasiTogri` chin bo'lgan render'da bir marta o'qiladi.
  const juftXatoSoni = React.useRef(0);
  const [natija, setNatija] = React.useState<PruefErgebnis | null>(null);
  const [savolBoshi, setSavolBoshi] = React.useState(() => Date.now());
  const [seansBoshi, setSeansBoshi] = React.useState(() => Date.now());

  // Natija ekranidagi ball/seriya/o'rin FARQ ko'rsatadi — buning uchun
  // seans BOSHLANGANDAGI surat kerak, va u `keyingiBoshlangichSurati`
  // (sof mantiq, sinalgan `seans-boshlangich.test.ts`da) orqali hisoblanadi.
  const boshlangichFortschritt = React.useRef<FortschrittSurati | null>(null);

  // Seans faqat serverdan savollar kelganda BIR MARTA boshlanadi — har
  // qayta chizilishda `boshla` chaqirilsa, o'quvchining joriy o'rni
  // yo'qolib, seans qaytadan boshidan tushardi.
  //
  // Boshlanish IKKALASINI ham kutadi — `seans.data` VA `fortschritt`ning
  // "hal bo'lganini" (`data` keldi YOKI so'rov xatoga uchradi). Sabab:
  // server har javobni DARHOL ballaydi, shuning uchun sekin ulanishda
  // `fortschritt` hali yuklanayotgan paytda birinchi savolga javob
  // berilsa, boshlang'ich surat o'sha ballni ALLAQACHON o'z ichiga olib,
  // seans oxiridagi farqni kamsitib ko'rsatardi (Task 9 review,
  // Important). Lekin FAQAT `fortschritt.data`ga emas — so'rov XATOGA
  // uchrasa `data` hech qachon kelmaydi va mashq abadiy shu yerda osilib
  // qolardi; ball dekor, muvaffaqiyatsiz yon so'rov mashqni to'smasligi
  // kerak (xuddi `YolTepasi`dagi kabi). Xato yo'lida boshlang'ich `null`
  // qoladi — bu allaqachon to'g'ri darajada tushiriladi: `yutuqlarBormi`
  // `natija-ekrani.tsx`da `false` bo'lib, karta shunchaki ko'rinmaydi.
  const boshlandiMi = React.useRef(false);
  React.useEffect(() => {
    if (boshlandiMi.current) return;
    if (!seans.data || seans.data.length === 0) return;
    if (!fortschritt.data && !fortschritt.isError) return;
    boshlandiMi.current = true;
    boshlangichFortschritt.current = keyingiBoshlangichSurati(
      boshlangichFortschritt.current,
      fortschrittSurati(fortschritt.data),
      false,
    );
    setHolat(boshla(seans.data));
  }, [seans.data, fortschritt.data, fortschritt.isError]);

  const frage = holat ? joriy(holat) : null;
  const rejim = frage ? harakat(frage.format) : null;

  // `PAAR`/`ZUORDNEN` `given`/`tayyor`ga UMUMAN muhtoj emas — ular
  // `pruefen`ga hech qachon yuborilmaydi (har juft `onJuft` orqali
  // alohida tekshiriladi, pastda). Shu ikkisi uchun `tayyor` doim
  // `false`: bu "ikki bosqichli Tekshirish"ga tayyorlik degani, va
  // ular uchun bunday bosqich yo'q.
  const given =
    rejim === "TANLASH"
      ? (tanlangan ?? "")
      : rejim === "YOZISH"
        ? yozilgan.trim()
        : yigilgan.join(" "); // SATZ_BAUEN

  const tayyor =
    rejim === "TANLASH"
      ? tanlangan != null
      : rejim === "YOZISH"
        ? yozilgan.trim().length > 0
        : frage && (frage.format === "PAAR" || frage.format === "ZUORDNEN")
          ? false
          : yigilgan.length > 0;

  const tekshir = () => {
    if (!frage || !tayyor || natija || pruefen.isPending) return;
    // Eng muhim qoida (task brief): `pruefen` juftlash formatlarida
    // CHAQIRILMAYDI — har juft allaqachon serverda (`useJuftTekshir`)
    // baholangan, ikkinchi marta yuborilsa ball ikki karra hisoblanardi.
    // `tayyor` yuqorida bu ikkisi uchun doim `false` bo'lgani uchun bu
    // qator amalda yetib bo'lmaydi, lekin Enter klaviatura ushlagichi
    // ham shu funksiyani chaqiradi — himoya qatlami sifatida qoladi.
    if (frage.format === "PAAR" || frage.format === "ZUORDNEN") return;
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

  /**
   * Chap va o'ng tugma bosilib juft hosil bo'lganda `Juftlash`dan
   * chaqiriladi (`PAAR`/`ZUORDNEN`gina). So'rovni yuborish, javobni
   * kutish va qachon savol tugaganini hal qilish — hammasi shu yerda,
   * komponent esa faqat chizadi (loyihaning o'zgarmas qoidasi).
   */
  const onJuft = (chapIdx: number, ongIdx: number) => {
    if (!frage || natija) return;
    if (frage.format !== "PAAR" && frage.format !== "ZUORDNEN") return;
    const format = frage.format;

    // `juftQoshildi` band chap/o'ngni O'ZGARISHSIZ (bir xil massiv
    // ma'lumotnomasi bilan) qaytaradi — shu orqali "haqiqatan qo'shildimi"
    // ni bilib olamiz, band bo'lsa server umuman so'ralmaydi. Bu faqat
    // himoya qatlami: `Juftlash` band tugmani allaqachon `disabled`
    // qiladi.
    const keyingiJuftlar = juftQoshildi(juftlar, chapIdx, ongIdx);
    if (keyingiJuftlar === juftlar) return;
    setJuftlar(keyingiJuftlar);

    const { chapUstun, ongUstun } = juftUstunlar(frage.options, format);
    juftTekshir.mutate(
      {
        // `frage.itemType` kengroq turga ega (`MaterialTyp`), lekin
        // server PAAR uchun HAR DOIM `WORT`, ZUORDNEN uchun HAR DOIM
        // `PHRASE` beradi (`wort-fragen.ts`/`satz-fragen.ts`) — shuning
        // uchun bu yerda toraytirish xavfsiz.
        itemType: frage.itemType as "WORT" | "PHRASE",
        itemId: frage.itemId,
        format,
        chap: chapUstun[chapIdx],
        ong: ongUstun[ongIdx],
      },
      {
        onSuccess: (javob) => {
          setJuftlar((prev) => juftJavobKeldi(prev, chapIdx, ongIdx, javob.isCorrect));
          if (javob.isCorrect) return;

          juftXatoSoni.current += 1;

          // Harakatni kamaytirishni so'ragan o'quvchi uchun qizil
          // chaqnash UMUMAN ko'rsatilmaydi — juft yuqoridagi
          // `juftJavobKeldi` bilan allaqachon ro'yxatdan olib
          // tashlangan, rang shu zahoti (oraliq holatsiz) "bo'sh"ga
          // qaytadi.
          const kamHarakatSoraladi =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (kamHarakatSoraladi) return;

          setXatoIdxlar((prev) => [...prev, { chapIdx, ongIdx }]);
          setTimeout(() => {
            setXatoIdxlar((prev) =>
              prev.filter((x) => x.chapIdx !== chapIdx || x.ongIdx !== ongIdx),
            );
          }, 500);
        },
        onError: (err) => {
          // Aloqa uzilsa juft OSILIB QOLMASLIGI kerak — eng yomon holat
          // shu bo'lardi, chunki savol hech qachon tugamas edi.
          // `juftJavobKeldi(..., false)` bilan ikkala tugma yana bo'sh
          // (bosiladigan) bo'ladi, o'quvchi qayta bosadi. Bu XATO
          // JAVOB sifatida HISOBLANMAYDI (`juftXatoSoni` oshmaydi) —
          // server hech narsa demadi, xato demadi.
          setJuftlar((prev) => juftJavobKeldi(prev, chapIdx, ongIdx, false));
          toast.error(getErrorMessage(err, "Yuborib bo'lmadi. Qayta bosing"));
        },
      },
    );
  };

  // Juftlash savoli tugaganda (hamma juft yashil): `javobBerildi`ga
  // sintetik natija beriladi. `isCorrect` — hamma juft BIRINCHI
  // urinishda to'g'ri bo'lganmi (`juftXatoSoni`), mijoz shuni sanaydi —
  // xavfsiz, chunki bu faqat savolning KEYINROQ qaytishiga ta'sir
  // qiladi (`javobBerildi`), ball esa allaqachon serverda hisoblangan.
  // `richtig: ""` — juftlash savoli to'g'ri javobsiz tugaydi, chunki
  // o'quvchi uni ekranda allaqachon yig'ib bo'lgan.
  React.useEffect(() => {
    if (!frage || natija) return;
    if (frage.format !== "PAAR" && frage.format !== "ZUORDNEN") return;
    if (!hammasiTogri(juftlar, juftSoni(frage.format))) return;
    setNatija({ isCorrect: juftXatoSoni.current === 0, richtig: "" });
  }, [juftlar, frage, natija]);

  const keyingi = async () => {
    // `ersatzSorov.isPending` ham qo'riqlaydi: `ersatz` so'rovi kutilayotgan
    // paytda ikkinchi marta bosish (ikki marta bosish yoki bosilgan
    // Enter'ni ushlab turish) shu funksiyani QAYTA ishga tushirardi — oxirgi
    // holat baribir to'g'ri chiqadi, lekin bekorga ikkinchi savol so'raladi
    // va tashlab yuboriladi.
    if (!holat || !frage || !natija || ersatzSorov.isPending) return;
    const { holat: yangi, ersatzSoralsinmi } = javobBerildi(holat, natija);

    let keyingiHolat = yangi;
    if (ersatzSoralsinmi) {
      if (darsMi) {
        // So'rov yiqilsa `null` deb qaraladi: savol tugatilgan hisoblanadi
        // va seans tugaydi. Aks holda `tugatilgan` hech qachon `jami` ga
        // yetmay, o'quvchi natija ekranini ko'rmay qolardi.
        const ersatz = await ersatzSorov
          .mutateAsync({
            lessonId: darsLessonId,
            itemType: frage.itemType,
            itemId: frage.itemId,
            nichtFormat: frage.format,
          })
          .catch(() => null);
        keyingiHolat = ersatzKeldi(yangi, ersatz);
      } else {
        // Takrorlash hech qanday darsga tegishli emas — server
        // `lessons/:id/uebung/ersatz`ni faqat dars uchun biladi, shuning
        // uchun bu yerda so'ralmaydi. Xato qilingan so'z baribir ertaga
        // Leitner jadvali orqali qaytadi, `null` esa aynan shu holatni
        // ifodalaydi (o'rinbosar topilmadi, savol tugatilgan hisoblanadi).
        keyingiHolat = ersatzKeldi(yangi, null);
      }
    }

    setHolat(keyingiHolat);
    setNatija(null);
    setTanlangan(null);
    setYozilgan("");
    setYigilgan([]);
    setJuftlar(boshlaJuftlar());
    setXatoIdxlar([]);
    juftXatoSoni.current = 0;
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

    // Natija ekranidagi ball/seriya/o'rin `fortschritt` YANGILANGANIDAN
    // keyingina to'g'ri ko'rinadi. Dars seansida buni `abschluss`ning
    // muvaffaqiyati ALLAQACHON qiladi (pastda, `invalidateQueries`
    // orqali) — lekin takrorlash `abschluss` UMUMAN yubormaydi, shuning
    // uchun yangilash bu yerda ikkala holat uchun ham so'raladi, o'sha
    // chaqiruvga osilib qolmay.
    void fortschritt.refetch();

    // Takrorlash so'rovi (`useWiederholung`) `staleTime: Infinity` bilan
    // abadiy keshda turadi va `abschluss` UMUMAN yubormaydi (pastda),
    // shuning uchun uning `onSuccess`idagi invalidatsiya takrorlash
    // seansini hech qachon eskirmagan qilib qo'ymaydi. Bu yerda — HAR
    // IKKALA manba (`dars` ham) uchun — aniq invalidatsiya qilinadi: oddiy
    // dars seansi ham muddati kelgan so'zlarni "yeb qo'yadi" (Leitner
    // holatini yangilaydi), shu bois keyingi Takrorlashga kirganda eski
    // (endi noto'g'ri) 12 savol emas, yangi holat ko'rinishi kerak.
    //
    // `refetchType: "none"` SHART. Takrorlash seansida aynan shu so'rov
    // hozir EKRANNI ushlab turibdi; sukut bo'yicha invalidatsiya uni
    // darrov qayta yuklardi va o'sha yuklash yiqilsa o'quvchining natija
    // ekrani "Mashqni ochib bo'lmadi" bilan almashib qolardi — mashqni
    // endigina tugatgan paytda. Invalidatsiya qilingan so'rov
    // `staleTime: Infinity` ga qaramay eskirgan hisoblanadi, ya'ni
    // keyingi kirishda baribir yangilanadi.
    void qc.invalidateQueries({
      queryKey: ["lernen", "wiederholung"],
      refetchType: "none",
    });

    // Takrorlash hech qanday darsga tegishli emas — `abschluss` bitta
    // darsni "tugallandi" deb belgilaydi, bu yerda esa belgilanadigan
    // dars yo'q. Vaqt baribir yuqorida muzlatib qo'yilgan — natija
    // ekrani uni `manba`dan qat'iy nazar ko'rsatadi.
    if (!darsMi) return;

    abschluss.mutate(
      {
        lessonId: darsLessonId,
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
    // Qasddan tushirilgan bog'liqliklar (har biri xavfsiz):
    // - `abschluss` — uning `.mutate`si react-query tomonidan barqaror
    //   ulanadi, render sayin o'zgarmaydi.
    // - `fortschritt` — xuddi shunday, `.refetch`i barqaror; ro'yxatga
    //   qo'shilsa har `fortschritt.data` yangilanishida bu butun effekt
    //   qayta ishga tushib, `abschluss.mutate`ni ikkinchi marta chaqirardi.
    // - `qc` — `useQueryClient()` bitta Providerdan olingan barqaror
    //   obyekt, komponent umri davomida o'zgarmaydi.
    // - `tugadimi` — sof, modul darajasidagi import, hech qachon o'zgarmaydi.
    // - `darsLessonId`, `darsMi` — shu ekran o'rnatilgan davomida
    //   o'zgarmaydigan propslardan hisoblanadi (marshrut/chaqiruvchi
    //   belgilaydi, hayot davomida barqaror).
    // - `seansBoshi` — holat, lekin bu effekt HECH QACHON "eski" chaqiruv
    //   sifatida qolib ketmaydi: pastdagi klaviatura effektidan farqli
    //   o'laroq, bu yerda uzoq umr ko'radigan listener O'RNATILMAYDI — u
    //   faqat `holat` chindan o'zgargan render'da, o'sha bitta renderning
    //   o'zida ishga tushadi. `qaytaOtish` `setSeansBoshi` va `setHolat`ni
    //   BIR PARTIYADA chaqiradi, shuning uchun `holat` o'zgargan renderda
    //   `seansBoshi` ham aynan o'sha yangi qiymatga ega bo'ladi — eskirish
    //   imkoni yo'q.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holat]);

  // Qayta o'tishda seans YANGI so'rov bilan yangilanadi — Leitner
  // jadvali orqali qaytgan so'zlar birinchi safargidan farq qilishi
  // mumkin, shuning uchun eski `seans.data` emas, `refetch` natijasi
  // ishlatiladi. `fortschritt` ham XUDDI SHUNDAY: ambient `fortschritt.data`
  // keshiga emas, shu yerda KUTILGAN `refetch()` natijasiga ishoniladi.
  //
  // Bu ATAYLAB shunday — avvalgi versiya ambient keshni o'qirdi va faqat
  // IZOHDA "tugash effektida allaqachon refetch qilingan" deb DA'VO
  // qilardi, biroq buni hech narsa MAJBURLAMAGAN edi: tugash effektidagi
  // `fortschritt.refetch()` KUTILMAYDI, "Qayta o'tish" tugmasi esa darhol
  // bosiladigan. Sekin ulanishda o'quvchi o'sha `refetch` tugashidan OLDIN
  // bossa, ambient kesh hali BIRINCHI SEANSDAN OLDINGI qiymatni ko'rsatib
  // turardi — va aynan o'sha eski qiymat retry uchun boshlang'ich sifatida
  // qulflanib qolardi, natijada ko'rsatilgan farq birinchi seans + retry'ni
  // BIRGA qamrab olardi (Task 9 review, round 2). Shu sabab bu yerda
  // `fortschritt.refetch()` ham `seans.refetch()` kabi so'raladi va
  // KUTILADI — ambient `fortschritt.data`ga umuman qo'l tegilmaydi.
  const qaytaOtish = async () => {
    const [seansNatija, fortschrittNatija] = await Promise.all([
      seans.refetch(),
      // Ball dekor — muvaffaqiyatsiz yon so'rov qayta o'tishni TO'SMASLIGI
      // kerak. Xato bo'lsa `null`ga tushadi, pastdagi `fortschrittSurati`
      // buni tabiiy ravishda "boshlang'ich noma'lum" holatiga aylantiradi
      // — natija ekranida esa bu allaqachon to'g'ri darajada tushiriladi
      // (yutuqlar kartasi shunchaki ko'rinmaydi).
      fortschritt.refetch().catch(() => null),
    ]);
    const { data } = seansNatija;
    if (!data) return;
    yozildi.current = false;
    tugashDavomiyligi.current = null;
    // Yangi urinish uchun yangi "boshlang'ich" nuqta — `qaytaOtishMi: true`
    // orqali `keyingiBoshlangichSurati` OLDINGI boshlang'ichni e'tiborsiz
    // qoldirib, YUQORIDA ENDIGINA KUTILGAN `fortschrittNatija`ni ishlatadi
    // (ambient `fortschritt.data` emas — sabab yuqorida).
    boshlangichFortschritt.current = keyingiBoshlangichSurati(
      boshlangichFortschritt.current,
      fortschrittSurati(fortschrittNatija?.data),
      true,
    );
    setHolat(boshla(data));
    setNatija(null);
    setTanlangan(null);
    setYozilgan("");
    setYigilgan([]);
    setJuftlar(boshlaJuftlar());
    setXatoIdxlar([]);
    juftXatoSoni.current = 0;
    setSavolBoshi(Date.now());
    setSeansBoshi(Date.now());
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Tirik savol yo'q bo'lsa (natija, 404 yoki xato ekrani — bularda
      // `frage` har doim `null`) bu ushlagich HECH NARSA qilmasligi kerak.
      // Aks holda u ekranga osilib qolgan holda `Enter`ning DEFAULT
      // amalini (bosilgan tugmani faollashtirishni) bekor qilardi — natija
      // ekranidagi "Davom etish"/"Qayta o'tish" va xato ekranlaridagi
      // "Orqaga"/"Qayta urinish" tugmalari Enter'ga o'lik bo'lib qolardi.
      if (!frage) return;
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
      // `pruefen.isPending` ham bloklaydi — aks holda `Tanlash`ga
      // uzatilgan `kutilmoqda` qulfi chetlab o'tilardi: sichqoncha
      // tugmalari o'chirilgan bo'lsa ham, klaviatura orqali "1"-"4"
      // bosib `tanlangan`ni javob kutayotgan paytda almashtirish mumkin
      // bo'lib qolardi.
      if (rejim !== "TANLASH" || natija || pruefen.isPending) return;
      const n = Number(e.key);
      if (n >= 1 && n <= (frage?.options.length ?? 0)) {
        setTanlangan(frage!.options[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Bu effekt UZOQ UMR KO'RADIGAN `window` listener o'rnatadi — u
    // yuqoridagi kabi "bitta renderda ishga tushadi" effekt emas: ro'yxatga
    // olingan `onKey` funksiyasi bog'liqliklar RO'YXATI o'zgarmaguncha
    // ekranga osilib qoladi, garchi HAR bir render yangi `onKey` yaratsa
    // ham. 3-round xatosi aynan shu yerda edi: `pruefen.isPending` ro'yxatda
    // yo'q edi, shuning uchun tekshiruv boshlanganda ekranga osilgan
    // `onKey` hamon ESKI (tekshiruv boshlanishidan OLDINGI) qiymatni
    // ko'rar, va uning ichidagi `tekshir()` qo'riqchisi ham eski
    // `pruefen.isPending`ni o'qir edi — raqam tugmasi qulfi ishlamas edi.
    //
    // Qasddan tushirilgan qolganlari (har biri xavfsiz):
    // - `keyingi`, `tekshir` — har render yangi yopilish (closure), lekin
    //   ularning QO'RIQCHI xatti-harakatiga ta'sir qiluvchi HAMMA qiymat
    //   (`rejim`, `natija`, `frage`, `tanlangan`, `given`, `tayyor`,
    //   `pruefen.isPending`, `ersatzSorov.isPending`) allaqachon
    //   ro'yxatda — demak, eski yopilish AHAMIYATLI bo'ladigan har bir
    //   renderda effekt qayta ishga tushib, listenerni yangi yopilish
    //   bilan qayta o'rnatadi. `ersatzSorov.isPending` xuddi
    //   `pruefen.isPending` bilan bo'lgani kabi kerak: `keyingi()`ning
    //   o'zi shu bayroqni tekshiradi (qayta kirishni bloklash uchun),
    //   ro'yxatda bo'lmasa Enter bosilishi eski (hali `false` bo'lgan)
    //   yopilishni chaqirib, ikkinchi `ersatz` so'rovini yubora olardi.
    // - `setTanlangan` — `useState` sozlagichi, React uning identifikatorini
    //   komponent umri davomida barqaror ushlab turishini kafolatlaydi.
    // - `pruefen`/`ersatzSorov` obyektlarining o'zi emas, faqat
    //   `.isPending`lari ro'yxatda — `.mutate`/`.mutateAsync`i barqaror,
    //   ularni kuzatish shart emas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rejim,
    natija,
    frage,
    tanlangan,
    given,
    tayyor,
    pruefen.isPending,
    ersatzSorov.isPending,
  ]);

  if (seans.isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-4">
        <LoadingCards />
      </div>
    );
  }

  if (seans.isError) {
    const status = axios.isAxiosError(seans.error) ? seans.error.response?.status : null;
    // `darsMi`ga bog'langan: 404 faqat "bu ID'dagi dars topilmadi" degani,
    // va bu tushuncha `wiederholung/uebung`ga tegishli emas — u dinamik
    // ID olmaydi, shuning uchun bu yerda haqiqatda erishib bo'lmaydi.
    // Takrorlashda istalgan xato pastdagi umumiy "Qayta urinish" holatiga
    // tushadi, u ham to'g'ri harakat — sahifa emas, so'rov qayta so'raladi.
    if (darsMi && status === 404) {
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

  if (seans.data && seans.data.length === 0) {
    if (darsMi) {
      // Yangi dvigatel bu dars uchun savol qura olmadi (masalan eski DiB
      // darsi) — Faza 2 ning eski sahifasiga tushiladi, u lug'at + mavjud
      // mashqlarni ko'rsatadi.
      return <LernenLessonPage lessonId={darsLessonId} />;
    }
    // Takrorlashda bo'sh natija ODATIY holat — hech kimning so'zi
    // muddati kelmagan bo'lishi mumkin. Xato ko'rinishi ISHLATILMAYDI,
    // chunki bu XATO EMAS.
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-10">
        <EmptyState
          icon={<CheckCircle size={28} weight="bold" />}
          title="Bugun takrorlanadigan so'z yo'q"
          description="Barcha so'zlaringiz hali muddatidan oldin — ertaga qayting."
          action={
            <Button variant="secondary" onClick={() => router.push("/portal/lernen")}>
              Yo&apos;lga qaytish
            </Button>
          }
        />
      </div>
    );
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
        gesamtBoshida={boshlangichFortschritt.current?.gesamt ?? null}
        serieBoshida={boshlangichFortschritt.current?.serie ?? null}
        orinBoshida={boshlangichFortschritt.current?.wochePlatzGruppe ?? null}
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
  // Juftlash formatlari (`PAAR`/`ZUORDNEN`) — jonli javob, ikki bosqichli
  // "Tekshirish" yo'q. Pastdagi tugma va natija paneli shu bayroqqa
  // qarab boshqa ko'rinishda chiziladi.
  const juftlashRejimi = frage.format === "PAAR" || frage.format === "ZUORDNEN";
  // Faqat pastdagi "Xato" panelining juftlar ro'yxati uchun — bir marta
  // hisoblanadi, `juftlar.map` ichida qayta-qayta emas.
  const juftlashUstunlar = juftlashRejimi
    ? juftUstunlar(frage.options, frage.format as "PAAR" | "ZUORDNEN")
    : null;

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
        {frage.format === "DIALOG_LUECKE" ? (
          // Butun suhbat ekranda — savol matni o'rniga (dizayn D7 / brief §5):
          // server `prompt`ni tayyor satr qilib yuboradi, mijoz uni faqat
          // chiroyli chizadi.
          <DialogBlok matn={frage.prompt} />
        ) : frage.prompt ? (
          <p className="text-2xl font-bold text-ink-900 sm:text-3xl">{frage.prompt}</p>
        ) : null}
        {/* `ZUORDNEN` uchun server `prompt`ni BO'SH yuboradi (ko'rik
            topilmasi tuzatildi): yuqoridagi ko'rsatma bilan deyarli bir
            xil matn ustma-ust chiqib qolardi. Bo'sh bo'lsa hech narsa
            chizilmaydi — o'rniga savol darrov javob maydoniga o'tadi. */}
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
        ) : juftlashRejimi ? (
          // `key`: savol almashganda (itemId+format) `Juftlash` BUTUNLAY
          // qayta o'rnatiladi — uning yagona mahalliy holati
          // (`kutilayotganIdx`, ikkinchi tomonni kutayotgan tanlov)
          // shu bilan avtomatik tozalanadi, alohida effekt kerak emas.
          <Yigish
            key={`${frage.itemType}:${frage.itemId}:${frage.format}`}
            // `juftlashRejimi` — bu yerdagi shart — oddiy `boolean`, TypeScript
            // uni tur qo'riqchisi sifatida ISHLATA OLMAYDI: `frage.format`
            // hamon kengroq `FrageFormat` bo'lib qoladi. Toraytirish faqat
            // `frage.format === "PAAR" || ... === "ZUORDNEN"`ni TO'G'RIDAN-
            // TO'G'RI shu joyda yozsa ishlagan bo'lardi, lekin bu shartni
            // ikkinchi marta takrorlagan bo'lardi — o'rniga `juftlashUstunlar`
            // (yuqorida) bilan bir xil, ATAYLAB toraytirilgan quyi tur.
            format={frage.format as "PAAR" | "ZUORDNEN"}
            options={frage.options}
            juftlar={juftlar}
            xatoIdxlar={xatoIdxlar}
            onJuft={onJuft}
          />
        ) : (
          <Yigish
            format="SATZ_BAUEN"
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
                juftlashRejimi ? (
                  // Jonli juftlashda `natija.richtig` ATAYLAB bo'sh
                  // (o'quvchi to'g'ri javobni ekranda allaqachon yig'ib
                  // bo'lgan — qayta ko'rsatishning hojati yo'q). Bu
                  // panel shu sabab qisqa vaqt (Keyingi darrov bosiladi)
                  // ko'rinadi, lekin ko'ringan daqiqada bo'sh qator
                  // o'rniga hozirgi `juftlar` holatidan RO'YXAT chiziladi
                  // — xuddi seans oxiridagi ro'yxatdagi kabi.
                  <ul className="mt-1 space-y-0.5">
                    {juftlar.map((j) => (
                      <li
                        key={`${j.chapIdx}-${j.ongIdx}`}
                        className="flex items-center justify-between gap-3 text-sm font-semibold text-ink-800"
                      >
                        <span>{juftlashUstunlar?.chapUstun[j.chapIdx]}</span>
                        <span>{juftlashUstunlar?.ongUstun[j.ongIdx]}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-sm font-semibold text-ink-800">{natija.richtig}</p>
                )
              ) : null}
            </div>
          ) : yuborishXato ? (
            <p className="text-sm font-semibold text-danger">
              Yuborib bo&apos;lmadi. Qayta urinib ko&apos;ring
            </p>
          ) : null}
          {juftlashRejimi ? (
            // Juftlashda "Tekshirish" bosqichi yo'q — tugma FAQAT
            // «Keyingi», va u hamma juft yashil bo'lgandagina (`natija`
            // yuqoridagi effekt orqali o'rnatilganda) faollashadi.
            <Button className="w-full" onClick={() => void keyingi()} disabled={!natija || ersatzSorov.isPending}>
              Keyingi
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={natija ? () => void keyingi() : tekshir}
              disabled={natija ? ersatzSorov.isPending : !tayyor || pruefen.isPending}
            >
              {natija ? "Keyingi" : pruefen.isPending ? "Tekshirilmoqda…" : "Tekshirish"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

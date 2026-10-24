"use client";

import * as React from "react";
import {
  CheckCircle,
  Heart,
  SpeakerHigh,
  X,
  XCircle,
} from "@phosphor-icons/react";
import { msg } from "@/i18n/msg";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { Button, Card } from "../lumio";
import { useCheckDrill, useLernenDrill } from "./queries";
import { useClipPlayer } from "./use-clip-player";
import type { DrillQuestion } from "./types";

const KIND_PROMPT: Record<DrillQuestion["kind"], string> = {
  AUDIO_TO_WORD: msg("Qaysi so'zni eshitdingiz?"),
  WORD_TO_UZ: msg("Tarjimani tanlang"),
  UZ_TO_WORD: msg("Nemischasini tanlang"),
};

/** Bitta mashqda nechta savol beriladi. */
const ROUND = 10;

/**
 * Bitta savolli ekran — dizayn tizimidagi Quiz maketi.
 *
 * Maketda uch narsa bor va uchalasi ham ma'noli: yuqorida progress
 * chizig'i, yuraklar (necha marta xato qilish mumkin), va ekranda FAQAT
 * BITTA savol. Avvalgi versiya o'nlab savolni ketma-ket to'kib tashlardi
 * — o'quvchi qayerda ekanini bilmasdi.
 */
function AnswerButton({
  option,
  index,
  state,
  onPick,
}: {
  option: string;
  index: number;
  state: "idle" | "sel" | "right" | "wrong";
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={state === "right" || state === "wrong"}
      style={{ ["--i" as string]: index } as React.CSSProperties}
      className={cn(
        "flex items-center gap-3 rounded-[18px] border-2 px-4 py-4 text-left font-display text-lg font-bold transition-all",
        // Xato javob SILKINADI. Rang yolg'iz yetarli emas: rangni
        // ajratolmaydigan o'quvchi uchun qizil hech narsa demaydi.
        state === "wrong" && "lumio-shake",
        state === "idle" && "hover:-translate-y-0.5",
        state === "idle" && "border-line bg-surface text-ink-900",
        state === "sel" && "border-coral-500 bg-coral-100/60 text-ink-900",
        state === "right" && "border-success bg-success/10 text-success",
        state === "wrong" && "border-danger bg-danger/10 text-danger",
      )}
    >
      <span
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-lg border-2 text-[13px]",
          state === "idle" && "border-line",
          state === "sel" && "border-coral-500",
          state === "right" && "border-success",
          state === "wrong" && "border-danger",
        )}
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">{option}</span>
      {state === "right" ? <CheckCircle size={22} weight="fill" /> : null}
      {state === "wrong" ? <XCircle size={22} weight="fill" /> : null}
    </button>
  );
}

function Question({
  question,
  lessonId,
  onAnswered,
}: {
  question: DrillQuestion;
  lessonId: number;
  onAnswered: (correct: boolean) => void;
}) {
  const t = useT();
  const [picked, setPicked] = React.useState<string | null>(null);
  const [startedAt] = React.useState(() => Date.now());
  const check = useCheckDrill();
  const play = useClipPlayer(question.audio);
  const result = check.data;
  const sorov = KIND_PROMPT[question.kind];

  // Tinglash savolida audio darhol o'ynaydi — savol audioning O'ZI, va
  // uni bosishni kutish savolni ko'rsatmay turishga teng.
  React.useEffect(() => {
    if (question.kind === "AUDIO_TO_WORD") play();
  }, [question.kind, play]);

  const submit = () => {
    if (!picked || result) return;
    check.mutate(
      {
        lessonId,
        index: question.index,
        given: picked,
        durationMs: Date.now() - startedAt,
      },
      { onSuccess: (r) => onAnswered(r.isCorrect) },
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-5">
      <h2 className="font-display text-[22px] font-extrabold text-ink-900">
        {t(sorov)}
      </h2>

      {/* Savol kartasi — maketdagi flashcard. */}
      <Card className="space-y-3 py-6 text-center">
        {question.kind === "AUDIO_TO_WORD" ? (
          <button
            type="button"
            onClick={play}
            aria-label={t("Yana eshitish")}
            className="mx-auto flex size-16 items-center justify-center rounded-full bg-tint text-coral-500 transition-transform active:scale-95"
          >
            <SpeakerHigh size={30} weight="fill" />
          </button>
        ) : (
          <p className="font-display text-[30px] font-extrabold leading-tight text-ink-900">
            {question.prompt}
          </p>
        )}
      </Card>

      {/* Variantlar ketma-ket chiqadi — hammasi birdan paydo bo'lsa,
          o'quvchi qayerdan o'qishni boshlashini bilmaydi. */}
      <div className="lumio-stagger grid gap-3">
        {question.options.map((opt, i) => (
          <AnswerButton
            key={opt}
            option={opt}
            index={i}
            state={
              result
                ? opt === result.answer
                  ? "right"
                  : picked === opt
                    ? "wrong"
                    : "idle"
                : picked === opt
                  ? "sel"
                  : "idle"
            }
            onPick={() => setPicked(opt)}
          />
        ))}
      </div>

      {result ? null : (
        <Button
          onClick={submit}
          disabled={!picked || check.isPending}
          className="mt-auto w-full"
        >
          {check.isPending ? t("Tekshirilmoqda…") : t("Javobni tekshirish")}
        </Button>
      )}
    </div>
  );
}

/**
 * Mashq — bitta darsning lug'atidan.
 *
 * Savollar soni CHEKLANADI: bir darsda 40 tagacha savol tug'ilishi
 * mumkin (har so'zga uchtadan), va ularning hammasini ketma-ket berish
 * mashqni charchatadigan qiladi. O'n savol — bir o'tirishga mo'ljallangan
 * hajm; qolgani keyingi urinishda keladi.
 */
export function VocabDrill({
  lessonId,
  onFinished,
  onExit,
}: {
  lessonId: number;
  onFinished: (correct: number, total: number) => void;
  onExit: () => void;
}) {
  const t = useT();
  const { data, isLoading } = useLernenDrill(lessonId);
  const [at, setAt] = React.useState(0);
  const [correct, setCorrect] = React.useState(0);
  const [hearts, setHearts] = React.useState(3);
  const [answered, setAnswered] = React.useState(false);

  const round = React.useMemo(() => data?.slice(0, ROUND) ?? [], [data]);

  if (isLoading || !data) {
    return <Card className="h-40 animate-pulse bg-tint" />;
  }
  if (round.length === 0) {
    return (
      <Card>
        <p className="font-semibold text-ink-600">
          {t("Bu darsda hali mashq yo'q — so'zlar tarjima yoki audio kutmoqda.")}
        </p>
      </Card>
    );
  }

  const q = round[at];
  const last = at === round.length - 1;
  const dead = hearts === 0;

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      {/* Yuqori qator: chiqish, progress, yuraklar — maketdagi kabi. */}
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={onExit}
          aria-label={t("Mashqdan chiqish")}
          className="text-ink-500"
        >
          <X size={26} weight="bold" />
        </button>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-sunk">
          <div
            className="h-full rounded-full bg-coral-500 transition-[width]"
            style={{ width: `${(at / round.length) * 100}%` }}
          />
        </div>
        <span className="inline-flex items-center gap-1.5 font-display text-[17px] font-extrabold text-coral-500">
          <Heart size={20} weight="fill" />
          {hearts}
        </span>
      </div>

      {dead ? (
        <Card className="space-y-4 text-center">
          <p className="font-display text-2xl font-extrabold text-ink-900">
            {t("Yuraklar tugadi")}
          </p>
          <p className="font-semibold text-ink-500">
            {t("So'zlarni bir ko'rib chiqing va qayta urinib ko'ring.")}
          </p>
          <Button className="w-full" onClick={onExit}>
            {t("So'zlarga qaytish")}
          </Button>
        </Card>
      ) : (
        <>
          <Question
            key={q.index}
            question={q}
            lessonId={lessonId}
            onAnswered={(ok) => {
              if (ok) setCorrect((c) => c + 1);
              else setHearts((h) => h - 1);
              setAnswered(true);
            }}
          />

          {answered ? (
            <Button
              className="w-full"
              onClick={() => {
                setAnswered(false);
                if (last) onFinished(correct, round.length);
                else setAt((i) => i + 1);
              }}
            >
              {last ? t("Mashqni yakunlash") : t("Davom etish")}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

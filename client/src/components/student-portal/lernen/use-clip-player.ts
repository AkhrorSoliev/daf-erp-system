"use client";

import * as React from "react";

export interface Clip {
  url: string;
  startMs: number | null;
  endMs: number | null;
}

/**
 * Audio faylning FAQAT bir bo'lagini o'ynatadi.
 *
 * Manbadagi mp3 butun bo'limni o'qiydi — o'ntacha so'z ketma-ket. Shuning
 * uchun so'z tugmasi oraliq bilan o'ynatiladi va tugash vaqtida
 * to'xtatiladi.
 *
 * To'xtatish TAYMER bilan, `timeupdate` bilan emas. Brauzerda
 * `timeupdate` taxminan chorak soniyada bir marta ishlaydi, ya'ni
 * to'xtatish har doim kechikadi va keyingi so'zning boshi eshitilib
 * qoladi. Taymer esa aniq: qolgan davomiylik hisoblanadi va shu vaqtda
 * to'xtatiladi. `timeupdate` faqat ZAXIRA sifatida qoladi — taymer
 * sekinlashgan tabda kechikishi mumkin.
 */
export function useClipPlayer(clip: Clip | null) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = React.useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    audioRef.current?.pause();
  }, []);

  // Ekrandan chiqilganda ovoz qolib ketmasligi kerak.
  React.useEffect(() => stop, [stop]);
  React.useEffect(() => {
    stop();
    audioRef.current = null;
  }, [clip?.url, stop]);

  return React.useCallback(() => {
    if (!clip) return;
    stop();

    audioRef.current ??= new Audio(clip.url);
    const el = audioRef.current;

    if (clip.startMs === null || clip.endMs === null) {
      el.currentTime = 0;
      void el.play();
      return;
    }

    const onUpdate = () => {
      if (el.currentTime * 1000 >= clip.endMs!) {
        el.removeEventListener("timeupdate", onUpdate);
        stop();
      }
    };

    el.currentTime = clip.startMs / 1000;
    el.addEventListener("timeupdate", onUpdate);
    void el.play();

    timerRef.current = setTimeout(() => {
      el.removeEventListener("timeupdate", onUpdate);
      stop();
    }, clip.endMs - clip.startMs);
  }, [clip, stop]);
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AudioLines,
  ImageIcon,
  Pause,
  Play,
  Sparkles,
  Users,
  BookOpen,
  ClipboardList,
  Video,
} from "lucide-react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { AssetList } from "./asset-list";
import {
  BEREICH_LABEL,
  hajm,
  yoshGuruhi,
  type MediaOverview,
  type MediaPersona,
} from "./media-types";

/** Kelajakdagi imkoniyatlar — hozircha faqat e'lon, bosilmaydi. */
const TEZ_KUNDA = [
  { icon: Sparkles, title: "Kontent yasash", desc: "Matnni o'zingiz yozasiz yoki AI yozib beradi" },
  { icon: BookOpen, title: "Dars yasash", desc: "Bo'limni qo'lda yig'ish: matn, audio, rasm, mashq" },
  { icon: ClipboardList, title: "Test yasash", desc: "Mashq turini tanlab, savollarni tuzish" },
  { icon: Video, title: "Video darslar", desc: "Videoga subtitr va mashq biriktirish" },
];

function PersonaCard({ p }: { p: MediaPersona }) {
  const band = yoshGuruhi(p.alter);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // Bitta vaqtda bitta ovoz: yangi ovoz bosilganda oldingisi to'xtaydi.
  // Aks holda o'nlab ovoz ustma-ust eshitiladi.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const stop = () => setPlaying(false);
    el.addEventListener("ended", stop);
    el.addEventListener("pause", stop);
    return () => {
      el.removeEventListener("ended", stop);
      el.removeEventListener("pause", stop);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      document.querySelectorAll("audio").forEach((a) => {
        if (a !== el) a.pause();
      });
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-square bg-muted">
        {p.portraitUrl ? (
          <Image
            src={p.portraitUrl}
            alt={`${p.vorname} ${p.nachname}`}
            fill
            sizes="(max-width: 768px) 50vw, 240px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
      </div>
      <CardContent className="space-y-2 p-3">
        <div>
          <div className="font-semibold leading-tight">
            {p.vorname} {p.nachname}
          </div>
          <div className="text-xs text-muted-foreground">
            {p.beruf} · {p.stadt}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px]">
            {band.label} · {p.alter}
          </Badge>
          {!p.stimme.dialogfaehig && (
            <Badge variant="outline" className="text-[10px]">
              faqat yakka
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {p.sprachen.join(", ")}
        </div>
        <div className="flex items-center gap-2 border-t pt-2">
          <button
            type="button"
            onClick={toggle}
            disabled={!p.probeUrl}
            aria-label={`${p.vorname} ovozini tinglash`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            {playing ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>
          <div className="min-w-0 text-[11px] leading-tight text-muted-foreground">
            <div className="truncate">{p.stimme.label}</div>
            <div className="tabular-nums">{p.stimme.hz} Hz</div>
          </div>
        </div>
        {p.probeUrl && (
          <audio ref={audioRef} src={p.probeUrl} preload="none" />
        )}
      </CardContent>
    </Card>
  );
}

export function MediaClient() {
  const [data, setData] = useState<MediaOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<MediaOverview>("/daf/media/overview")
      .then(({ data }) => {
        if (!cancelled) setData(data);
      })
      .catch(() => {
        if (!cancelled) setError("Ma'lumot olinmadi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [q, setQ] = useState("");
  const [niveau, setNiveau] = useState<string>("hammasi");

  const audio = data?.nachArt.find((a) => a.kind === "AUDIO");
  const image = data?.nachArt.find((a) => a.kind === "IMAGE");

  /** Mavjud darajalar ro'yxatdan olinadi — qo'lda sanab yozilmaydi, aks
   *  holda A2 qo'shilganda filtr uni ko'rsatmay qo'yardi. */
  const niveaus = useMemo(() => {
    const set = new Set<string>();
    for (const a of data?.alle ?? []) if (a.niveau) set.add(a.niveau);
    return [...set].sort();
  }, [data]);

  const gefiltert = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.alle ?? []).filter((a) => {
      if (niveau !== "hammasi" && a.niveau !== niveau) return false;
      if (!term) return true;
      return (
        a.titel.toLowerCase().includes(term) || a.key.toLowerCase().includes(term)
      );
    });
  }, [data, q, niveau]);

  const bereiche = data?.nachBereich ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Media</h1>
        <p className="text-sm text-muted-foreground">
          O'quv kontenti uchun yasalgan obrazlar, ovozlar va rasmlar.
        </p>
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {error}
          </CardContent>
        </Card>
      )}

      {data && !data.vorhanden && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Kontent fayllari topilmadi. Server <code>content/daf</code> papkasini
            ko'rmayapti.
          </CardContent>
        </Card>
      )}

      {data?.vorhanden && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Users} value={String(data.personas.length)} label="obraz" />
            <StatCard
              icon={AudioLines}
              value={String(audio?.anzahl ?? 0)}
              label={`ovoz · ${hajm(audio?.bytes ?? 0)}`}
            />
            <StatCard
              icon={ImageIcon}
              value={String(image?.anzahl ?? 0)}
              label={`rasm · ${hajm(image?.bytes ?? 0)}`}
            />
            <StatCard
              icon={Sparkles}
              value={String(data.personas.filter((p) => p.stimme.dialogfaehig).length)}
              label="suhbatga yaroqli"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Qidirish — sarlavha yoki kalit"
              className="h-9 max-w-xs"
            />
            <div className="flex gap-1">
              {["hammasi", ...niveaus].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNiveau(n)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    niveau === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {n === "hammasi" ? "Hamma daraja" : n}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-muted-foreground">
              {gefiltert.length} / {data.summe.anzahl}
            </span>
          </div>

          <Tabs defaultValue="persona">
            <TabsList>
              {bereiche.map((b) => (
                <TabsTrigger key={b.bereich} value={b.bereich}>
                  {BEREICH_LABEL[b.bereich] ?? b.bereich}
                  <span className="ml-1.5 text-[10px] tabular-nums opacity-60">
                    {b.anzahl}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="persona" className="mt-4 space-y-4">
              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {data.personas.map((p) => (
                  <PersonaCard key={p.id} p={p} />
                ))}
              </div>
              <AssetList
                assets={gefiltert.filter((a) => a.bereich === "persona")}
              />
            </TabsContent>

            {bereiche
              .filter((b) => b.bereich !== "persona")
              .map((b) => (
                <TabsContent key={b.bereich} value={b.bereich} className="mt-4">
                  <AssetList
                    assets={gefiltert.filter((a) => a.bereich === b.bereich)}
                  />
                </TabsContent>
              ))}
          </Tabs>
        </>
      )}

      <div>
        <h2 className="mb-1 text-lg font-semibold">Tez kunda</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Bu imkoniyatlar tayyorlanmoqda.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TEZ_KUNDA.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="border-dashed">
              <CardContent className="space-y-1.5 p-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
                <Badge variant="outline" className="text-[10px]">
                  tez kunda
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Users;
  value: string;
  label: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="text-xl font-semibold tabular-nums leading-none">
            {value}
          </div>
          <div className="truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { Avatar, Card, LoadingCards, Screen, StackHeader } from "../../lumio";
import { useT } from "@/i18n/use-t";
import { useOeffentlichesProfil } from "../queries";
import { qisqaRaqam } from "../yol/yol-tuzilishi";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";
import { DarajaKartasi } from "./reyting-ekrani";

/** Boshqa o'quvchining profili: rasm, ism, daraja va shu haftadagi o'rni. */
export function OeffentlichesProfilEkrani({ id }: { id: number }) {
  const t = useT();
  const query = useOeffentlichesProfil(id);
  const { data } = query;

  return (
    <Screen narrow>
      <StackHeader title={t("Profil")} backHref="/portal/lernen/reyting" />
      {loadState(query) === "loading" ? (
        <LoadingCards count={2} />
      ) : !data ? (
        <LoadFailed query={query} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <Avatar src={data.photo} name={data.name} size={96} />
            <h2 className="font-display text-xl font-extrabold text-ink-900">{data.name}</h2>
          </div>
          <DarajaKartasi {...data} />
          <Card className="text-center">
            <p className="font-display text-2xl font-extrabold text-ink-900">
              {t("Shu hafta markazda {n}-o'rin", { n: data.wochePlatzZentrum })}
            </p>
            <p className="text-sm font-semibold text-ink-500">
              {t("{n} ball", { n: qisqaRaqam(data.wochePunkte) })}
            </p>
          </Card>
        </div>
      )}
    </Screen>
  );
}

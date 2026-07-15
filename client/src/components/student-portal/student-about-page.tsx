import { Lightning, Phone, Globe, PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import { Screen, StackHeader, FadeIn, Card } from "./lumio";

const APP_VERSION = "1.0.0";

export function StudentAboutPage() {
  return (
    <Screen>
      <StackHeader title="Biz haqimizda" backHref="/portal/more" />

      <FadeIn index={0}>
        <div className="flex flex-col items-center gap-3 py-2">
          <span className="flex size-20 items-center justify-center rounded-3xl bg-coral-500 text-white clay-coral">
            <Lightning size={40} weight="fill" />
          </span>
          <h2 className="font-display text-[27px] font-extrabold text-ink-900">
            DAF Sprachzentrum
          </h2>
          <p className="text-center text-sm font-semibold text-ink-500">
            Nemis tili o&apos;quv markazi
          </p>
        </div>
      </FadeIn>

      <FadeIn index={1}>
        <Card className="space-y-2">
          <h3 className="font-display text-lg font-bold text-ink-900">
            Markaz haqida
          </h3>
          <p className="text-[15px] font-semibold leading-relaxed text-ink-700">
            DAF Sprachzentrum — nemis tilini zamonaviy uslublarda o&apos;rgatuvchi
            markaz. Ushbu portal orqali jadvalingizni, davomatingizni va
            to&apos;lovlaringizni bir joyda kuzatib borasiz.
          </p>
        </Card>
      </FadeIn>

      <FadeIn index={2}>
        <Card className="space-y-3">
          <h3 className="font-display text-lg font-bold text-ink-900">Aloqa</h3>
          <div className="flex items-center gap-3 text-[15px] font-semibold text-ink-700">
            <Phone size={20} weight="bold" className="text-teal-600" />
            +998 90 000 00 00
          </div>
          <div className="flex items-center gap-3 text-[15px] font-semibold text-ink-700">
            <Globe size={20} weight="bold" className="text-sky-600" />
            dafzentrum.uz
          </div>
          <div className="flex items-center gap-3 text-[15px] font-semibold text-ink-700">
            <PaperPlaneTilt size={20} weight="bold" className="text-sky-500" />
            @dafzentrum
          </div>
        </Card>
      </FadeIn>

      <p className="text-center text-sm font-semibold text-ink-500">
        Portal versiyasi {APP_VERSION}
      </p>
    </Screen>
  );
}

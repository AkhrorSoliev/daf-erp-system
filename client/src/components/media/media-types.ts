export interface PersonaStimme {
  engine: string;
  voice: string;
  label: string;
  hz: number;
  dialogfaehig: boolean;
}

export interface MediaPersona {
  id: string;
  vorname: string;
  nachname: string;
  alter: number;
  geschlecht: "w" | "m";
  stadt: string;
  land: string;
  sprachen: string[];
  beruf: string;
  stimme: PersonaStimme;
  portraitUrl: string | null;
  probeUrl: string | null;
}

export interface MediaAsset {
  key: string;
  kind: "AUDIO" | "VIDEO" | "IMAGE" | "PDF";
  bytes: number;
  sha256: string;
  bereich: string;
  niveau: string | null;
  einheit: string | null;
  titel: string;
  url: string | null;
}

export interface MediaOverview {
  personas: MediaPersona[];
  alle: MediaAsset[];
  nachArt: { kind: string; anzahl: number; bytes: number }[];
  nachBereich: { bereich: string; anzahl: number; bytes: number }[];
  summe: { anzahl: number; bytes: number };
  vorhanden: boolean;
}

/** Bo'lim nomlari — server kalitlaridan sahifadagi matnga bitta xarita. */
export const BEREICH_LABEL: Record<string, string> = {
  persona: "Obrazlar",
  einheit: "Bo'limlar",
  sendung: "Ko'rsatuvlar",
  sonstiges: "Boshqa",
};

export const KIND_LABEL: Record<string, string> = {
  AUDIO: "audio",
  IMAGE: "rasm",
  VIDEO: "video",
  PDF: "PDF",
};

/** Yosh guruhi — kartadagi belgi va filtr uchun bitta manba. */
export function yoshGuruhi(alter: number): { key: string; label: string } {
  if (alter <= 12) return { key: "bola", label: "Bola" };
  if (alter <= 19) return { key: "osmir", label: "O'smir" };
  if (alter <= 35) return { key: "yosh", label: "Yosh" };
  if (alter <= 60) return { key: "orta", label: "O'rta yosh" };
  return { key: "qariya", label: "Qariya" };
}

export function hajm(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

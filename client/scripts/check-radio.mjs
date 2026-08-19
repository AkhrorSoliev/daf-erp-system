#!/usr/bin/env node
/**
 * Health check for the curated radio list.
 *
 *   npm run radio:check
 *
 * Radio stations rot: broadcasters move CDN, drop a bitrate, or switch to
 * HLS-only. Because `src/lib/radio-stations.ts` is a static list, nothing tells
 * us when that happens — a student just taps play and nothing comes out. This
 * script connects to every stream and reports what broke.
 *
 * When a station fails, it asks radio-browser.info for the current URL behind
 * that station's uuid and prints it, so the fix is a copy-paste. It never edits
 * the list itself: a replacement URL still needs a human to confirm it is the
 * main channel and not a themed sub-stream.
 *
 * Exits non-zero if anything failed, so it can run in CI on a schedule.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const UA = "DafErpRadio/1.0 (+https://student.dafzentrum.uz)";
const RB = "https://de2.api.radio-browser.info";
const TIMEOUT_MS = 12_000;
/** Enough bytes to prove it is a real stream and not an error page. */
const MIN_BYTES = 16_000;

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "src", "lib", "radio-stations.ts"), "utf8");

/**
 * The list is a TS literal, so it cannot be imported from plain node. Pulling
 * the four fields we need out with a regex keeps this script dependency-free.
 */
function parseStations(text) {
  const stations = [];
  const blocks = text.split(/\n  \{\n/).slice(1);
  for (const block of blocks) {
    const pick = (key) =>
      block.match(new RegExp(`${key}:\\s*"([^"]*)"`))?.[1] ?? null;
    const id = pick("id");
    const name = pick("name");
    const url = pick("url");
    const uuid = pick("uuid");
    if (id && name && url && uuid) stations.push({ id, name, url, uuid });
  }
  return stations;
}

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Icy-MetaData": "1" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

    const type = res.headers.get("content-type") ?? "";
    if (!/audio|mpeg|aac|ogg/i.test(type)) {
      return { ok: false, reason: `audio emas (${type || "content-type yo'q"})` };
    }

    // Read a slice of the body — a 200 with a content-type is not proof that
    // bytes actually flow.
    const reader = res.body.getReader();
    let bytes = 0;
    while (bytes < MIN_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
    }
    await reader.cancel().catch(() => {});
    if (bytes < MIN_BYTES) return { ok: false, reason: `juda kam ma'lumot (${bytes}b)` };

    return { ok: true, type, bytes };
  } catch (err) {
    return { ok: false, reason: err.name === "AbortError" ? "vaqt tugadi" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Current URL radio-browser holds for this station, if any. */
async function suggest(uuid) {
  try {
    const res = await fetch(`${RB}/json/stations/byuuid/${uuid}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const [station] = await res.json();
    if (!station?.url_resolved) return null;
    return {
      url: station.url_resolved,
      codec: station.codec,
      bitrate: station.bitrate,
      ok: station.lastcheckok === 1,
    };
  } catch {
    return null;
  }
}

const stations = parseStations(source);
if (!stations.length) {
  console.error("radio-stations.ts dan bitta ham stansiya o'qilmadi — format o'zgargan?");
  process.exit(2);
}

console.log(`${stations.length} ta stansiya tekshirilmoqda...\n`);

const results = await Promise.all(
  stations.map(async (station) => ({ station, result: await probe(station.url) })),
);

const broken = [];
for (const { station, result } of results) {
  if (result.ok) {
    console.log(`  OK    ${station.name}`);
  } else {
    console.log(`  XATO  ${station.name} — ${result.reason}`);
    broken.push(station);
  }
}

if (!broken.length) {
  console.log(`\nHammasi ishlayapti (${stations.length}/${stations.length}).`);
  process.exit(0);
}

console.log(`\n${broken.length} ta stansiya ishlamadi. radio-browser'dan yangi URL so'ralmoqda:\n`);
for (const station of broken) {
  const found = await suggest(station.uuid);
  if (!found) {
    console.log(`  ${station.name}: radio-browser ham topa olmadi — ro'yxatdan olib tashlash kerak.`);
    continue;
  }
  const flags = [];
  if (!found.url.startsWith("https://")) flags.push("HTTPS EMAS");
  if (found.url.includes(".m3u8")) flags.push("HLS — <audio> o'qiy olmaydi");
  if (!found.ok) flags.push("radio-browser ham buzuq deb belgilagan");
  console.log(
    `  ${station.name}:\n    ${found.url}\n    ${found.codec} ${found.bitrate}k` +
      (flags.length ? `  [${flags.join(", ")}]` : ""),
  );
}

console.log("\nURL'ni src/lib/radio-stations.ts ichida qo'lda almashtiring.");
process.exit(1);

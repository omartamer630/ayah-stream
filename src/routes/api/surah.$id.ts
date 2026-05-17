import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ayahAudioUrl, getSurah, RECITERS } from "@/lib/quran";

const reciterIds = RECITERS.map((r) => r.id) as [string, ...string[]];

const Query = z.object({
  start: z.coerce.number().int().min(1).max(286),
  end: z.coerce.number().int().min(1).max(286),
  reciter: z.enum(reciterIds).default("Alafasy_128kbps"),
});

/**
 * Normalize Arabic Quran text while preserving tashkeel (harakat).
 * - Unicode NFC normalize so composed/decomposed marks match the mushaf.
 * - Strip tatweel (U+0640) — a purely decorative stretching character.
 * - Strip zero-width / bidi formatters (ZWJ, ZWNJ, LRM, RLM, BOM, etc.).
 * - Collapse runs of whitespace (incl. Arabic-friendly NBSP) to a single space.
 * - Trim leading/trailing whitespace.
 * Preserved: all harakat U+064B–U+065F, shadda, sukun, dagger alif (U+0670),
 *   small Quranic marks U+06D6–U+06ED, hamza forms, and ayah end markers.
 */
function normalizeArabic(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFC")
    .replace(/\u0640/g, "") // tatweel
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "") // zero-width & bidi
    .replace(/[\t\n\r\u00A0\u2000-\u200A\u2028\u2029\u3000]+/g, " ") // unify whitespace
    .replace(/ {2,}/g, " ")
    .trim();
}

export const Route = createFileRoute("/api/surah/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const surahNum = Number(params.id);
        const surah = getSurah(surahNum);
        if (!surah) {
          return Response.json({ error: "Invalid surah" }, { status: 404 });
        }
        const url = new URL(request.url);
        const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const start = Math.max(1, Math.min(parsed.data.start, surah.c));
        const end = Math.max(start, Math.min(parsed.data.end, surah.c));
        const reciter = parsed.data.reciter;

        const texts: Record<number, string> = {};
        // Primary: api.quran.com (official Madina mushaf, Uthmani Hafs script, fully voweled)
        try {
          const res = await fetch(
            `https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${surahNum}`,
            { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit,
          );
          if (res.ok) {
            const json = (await res.json()) as {
              verses?: Array<{ verse_key: string; text_uthmani: string }>;
            };
            for (const v of json.verses ?? []) {
              const [, ayahStr] = v.verse_key.split(":");
              const n = Number(ayahStr);
              if (n) texts[n] = v.text_uthmani;
            }
          }
        } catch {
          // ignore, fallback below
        }
        // Fallback: alquran.cloud Hafs Uthmani edition
        if (Object.keys(texts).length === 0) {
          try {
            const res = await fetch(
              `https://api.alquran.cloud/v1/surah/${surahNum}/quran-uthmani-hafs`,
              { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit,
            );
            if (res.ok) {
              const json = (await res.json()) as {
                data?: { ayahs?: Array<{ numberInSurah: number; text: string }> };
              };
              for (const a of json.data?.ayahs ?? []) texts[a.numberInSurah] = a.text;
            }
          } catch {
            // network failure — return without text
          }
        }

        const ayahs = Array.from({ length: end - start + 1 }, (_, i) => {
          const a = start + i;
          return { ayah: a, audioUrl: ayahAudioUrl(reciter, surahNum, a), text: texts[a] ?? "" };
        });

        return Response.json(
          {
            surah: surahNum,
            name: surah.a,
            arabicName: surah.ar,
            range: [start, end],
            reciter,
            ayahs,
          },
          {
            headers: { "Cache-Control": "public, max-age=86400" },
          },
        );
      },
    },
  },
});

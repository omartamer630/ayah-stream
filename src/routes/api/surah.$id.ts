import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { ayahAudioUrl, getSurah, RECITERS } from "@/lib/quran";

/**
 * OpenTelemetry tracer for normalized-text loading. Resolves to the globally
 * registered TracerProvider when one is configured (e.g. via an OTel SDK or
 * Cloudflare's Workers Observability OTLP exporter); otherwise the API
 * defaults to a no-op tracer so this code is safe to run anywhere.
 */
const tracer = trace.getTracer("surah-text", "1.0.0");

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

/**
 * Module-level cache of normalized Arabic text per surah.
 * Key: surah number → Map<ayahNumber, normalizedText>.
 * Lives for the lifetime of the worker isolate. Combined with the existing
 * HTTP `Cache-Control: max-age=86400` header and Cloudflare edge cache,
 * this means each surah's text is fetched + normalized at most once per
 * isolate per day, and reused across all ayah ranges/reciters.
 */
const surahTextCache = new Map<number, Map<number, string>>();

/**
 * Rolling cache metrics for this worker isolate. Reset on cold start.
 * Logged on every load and exposed via the `x-cache-*` response headers
 * so you can monitor hit rate + fetch latency without external infra.
 */
const cacheMetrics = {
  hits: 0,
  misses: 0,
  fetchCount: 0,
  fetchErrors: 0,
  totalFetchMs: 0,
  get hitRate() {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  },
  get avgFetchMs() {
    return this.fetchCount === 0 ? 0 : this.totalFetchMs / this.fetchCount;
  },
};

type LoadResult = {
  texts: Map<number, string>;
  cacheStatus: "hit" | "miss";
  fetchMs: number;
  source: "quran.com" | "alquran.cloud" | "none";
};

async function fetchSource(
  spanName: string,
  attrs: Record<string, string | number>,
  fn: () => Promise<{ ok: boolean; size: number; status?: number }>,
): Promise<{ ok: boolean; size: number; status?: number; error?: unknown }> {
  return tracer.startActiveSpan(spanName, { attributes: attrs }, async (span) => {
    const startedAt = Date.now();
    try {
      const result = await fn();
      span.setAttribute("surah_text.fetch_ms", Date.now() - startedAt);
      span.setAttribute("surah_text.ayahs_loaded", result.size);
      if (result.status !== undefined) span.setAttribute("http.status_code", result.status);
      if (!result.ok) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `non-ok status ${result.status}` });
      }
      return result;
    } catch (err) {
      span.setAttribute("surah_text.fetch_ms", Date.now() - startedAt);
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      return { ok: false, size: 0, error: err };
    } finally {
      span.end();
    }
  });
}

async function loadSurahTexts(surahNum: number): Promise<LoadResult> {
  return tracer.startActiveSpan<[], Promise<LoadResult>>(
    "surah_text.load",
    { attributes: { "surah_text.surah": surahNum } },
    async (rootSpan) => {
      const cached = surahTextCache.get(surahNum);
      if (cached) {
        cacheMetrics.hits += 1;
        rootSpan.setAttributes({
          "surah_text.cache_status": "hit",
          "surah_text.ayahs": cached.size,
          "surah_text.hit_rate": cacheMetrics.hitRate,
          "surah_text.hits": cacheMetrics.hits,
          "surah_text.misses": cacheMetrics.misses,
        });
        rootSpan.addEvent("cache.hit", { surah: surahNum, ayahs: cached.size });
        console.log(
          `[surah-text] HIT surah=${surahNum} ayahs=${cached.size} ` +
            `hitRate=${(cacheMetrics.hitRate * 100).toFixed(1)}% ` +
            `hits=${cacheMetrics.hits} misses=${cacheMetrics.misses}`,
        );
        rootSpan.end();
        return { texts: cached, cacheStatus: "hit", fetchMs: 0, source: "quran.com" };
      }

      cacheMetrics.misses += 1;
      rootSpan.addEvent("cache.miss", { surah: surahNum });
      const texts = new Map<number, string>();
      let source: LoadResult["source"] = "none";
      const startedAt = Date.now();

      // Primary: api.quran.com (Madina Hafs)
      const primary = await fetchSource(
        "surah_text.fetch.quran_com",
        { "surah_text.surah": surahNum, "http.url": "api.quran.com" },
        async () => {
          const res = await fetch(
            `https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${surahNum}`,
            { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit,
          );
          if (!res.ok) return { ok: false, size: 0, status: res.status };
          const json = (await res.json()) as {
            verses?: Array<{ verse_key: string; text_uthmani: string }>;
          };
          for (const v of json.verses ?? []) {
            const [, ayahStr] = v.verse_key.split(":");
            const n = Number(ayahStr);
            if (n) texts.set(n, normalizeArabic(v.text_uthmani));
          }
          return { ok: true, size: texts.size, status: res.status };
        },
      );
      if (primary.ok && texts.size > 0) source = "quran.com";
      else if (!primary.ok) {
        cacheMetrics.fetchErrors += 1;
        console.warn(`[surah-text] primary failed surah=${surahNum} status=${primary.status}`);
      }

      // Fallback: alquran.cloud Hafs Uthmani
      if (texts.size === 0) {
        const fallback = await fetchSource(
          "surah_text.fetch.alquran_cloud",
          { "surah_text.surah": surahNum, "http.url": "api.alquran.cloud" },
          async () => {
            const res = await fetch(
              `https://api.alquran.cloud/v1/surah/${surahNum}/quran-uthmani-hafs`,
              { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit,
            );
            if (!res.ok) return { ok: false, size: 0, status: res.status };
            const json = (await res.json()) as {
              data?: { ayahs?: Array<{ numberInSurah: number; text: string }> };
            };
            for (const a of json.data?.ayahs ?? []) {
              texts.set(a.numberInSurah, normalizeArabic(a.text));
            }
            return { ok: true, size: texts.size, status: res.status };
          },
        );
        if (fallback.ok && texts.size > 0) source = "alquran.cloud";
        else if (!fallback.ok) {
          cacheMetrics.fetchErrors += 1;
          console.warn(`[surah-text] fallback failed surah=${surahNum} status=${fallback.status}`);
        }
      }

      const fetchMs = Date.now() - startedAt;
      cacheMetrics.fetchCount += 1;
      cacheMetrics.totalFetchMs += fetchMs;

      // Only cache successful loads so transient failures can retry.
      if (texts.size > 0) surahTextCache.set(surahNum, texts);

      rootSpan.setAttributes({
        "surah_text.cache_status": "miss",
        "surah_text.source": source,
        "surah_text.ayahs": texts.size,
        "surah_text.fetch_ms": fetchMs,
        "surah_text.avg_fetch_ms": cacheMetrics.avgFetchMs,
        "surah_text.hit_rate": cacheMetrics.hitRate,
        "surah_text.hits": cacheMetrics.hits,
        "surah_text.misses": cacheMetrics.misses,
        "surah_text.errors": cacheMetrics.fetchErrors,
        "surah_text.cached_surahs": surahTextCache.size,
      });
      if (source === "none") {
        rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: "no source returned text" });
      }

      console.log(
        `[surah-text] MISS surah=${surahNum} source=${source} ayahs=${texts.size} ` +
          `fetchMs=${fetchMs} avgFetchMs=${cacheMetrics.avgFetchMs.toFixed(0)} ` +
          `hitRate=${(cacheMetrics.hitRate * 100).toFixed(1)}% ` +
          `hits=${cacheMetrics.hits} misses=${cacheMetrics.misses} ` +
          `errors=${cacheMetrics.fetchErrors} cachedSurahs=${surahTextCache.size}`,
      );

      rootSpan.end();
      return { texts, cacheStatus: "miss", fetchMs, source };
    },
  );
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

        const { texts, cacheStatus, fetchMs, source } = await loadSurahTexts(surahNum);

        const ayahs = Array.from({ length: end - start + 1 }, (_, i) => {
          const a = start + i;
          return { ayah: a, audioUrl: ayahAudioUrl(reciter, surahNum, a), text: texts.get(a) ?? "" };
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
            headers: {
              "Cache-Control": "public, max-age=86400",
              "x-cache-status": cacheStatus,
              "x-cache-source": source,
              "x-cache-fetch-ms": String(fetchMs),
              "x-cache-hit-rate": cacheMetrics.hitRate.toFixed(3),
              "x-cache-hits": String(cacheMetrics.hits),
              "x-cache-misses": String(cacheMetrics.misses),
              "x-cache-errors": String(cacheMetrics.fetchErrors),
              "x-cache-surahs": String(surahTextCache.size),
            },
          },
        );
      },
    },
  },
});

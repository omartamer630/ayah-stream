import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ayahAudioUrl, getSurah, RECITERS } from "@/lib/quran";

const reciterIds = RECITERS.map((r) => r.id) as [string, ...string[]];

const Query = z.object({
  start: z.coerce.number().int().min(1).max(286),
  end: z.coerce.number().int().min(1).max(286),
  reciter: z.enum(reciterIds).default("Alafasy_128kbps"),
});

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

        const ayahs = Array.from({ length: end - start + 1 }, (_, i) => {
          const a = start + i;
          return { ayah: a, audioUrl: ayahAudioUrl(reciter, surahNum, a) };
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

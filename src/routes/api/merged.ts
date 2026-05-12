import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ayahAudioUrl, getSurah, pad3, RECITERS } from "@/lib/quran";

const reciterIds = RECITERS.map((r) => r.id) as [string, ...string[]];

const Query = z.object({
  surah: z.coerce.number().int().min(1).max(114),
  start: z.coerce.number().int().min(1).max(286),
  end: z.coerce.number().int().min(1).max(286),
  reciter: z.enum(reciterIds),
  download: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/api/merged")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const { surah: s, start: rawStart, end: rawEnd, reciter, download } = parsed.data;
        const surah = getSurah(s);
        if (!surah) return new Response("Invalid surah", { status: 404 });

        const start = Math.max(1, Math.min(rawStart, surah.c));
        const end = Math.max(start, Math.min(rawEnd, surah.c));
        if (end - start + 1 > 50) {
          return new Response("Maximum 50 ayahs per merge", { status: 400 });
        }

        const indexes = Array.from({ length: end - start + 1 }, (_, i) => start + i);
        let parts: Uint8Array[];
        try {
          parts = await Promise.all(
            indexes.map(async (a) => {
              const res = await fetch(ayahAudioUrl(reciter, s, a));
              if (!res.ok) throw new Error(`ayah ${a}: ${res.status}`);
              return new Uint8Array(await res.arrayBuffer());
            }),
          );
        } catch (e) {
          return new Response(`Failed to fetch audio: ${(e as Error).message}`, { status: 502 });
        }

        const total = parts.reduce((n, p) => n + p.byteLength, 0);
        const merged = new Uint8Array(total);
        let off = 0;
        for (const p of parts) {
          merged.set(p, off);
          off += p.byteLength;
        }
        const ab = merged.buffer.slice(
          merged.byteOffset,
          merged.byteOffset + merged.byteLength,
        ) as ArrayBuffer;

        const headers: Record<string, string> = {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=3600",
          "Accept-Ranges": "bytes",
        };
        if (download) {
          headers["Content-Disposition"] =
            `attachment; filename="surah-${pad3(s)}-${start}-${end}.mp3"`;
        }
        return new Response(ab, { headers });
      },
    },
  },
});
